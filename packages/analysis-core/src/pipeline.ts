import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { Browser } from "playwright";
import {
  REPORT_SCHEMA_VERSION,
  ReportSchema,
  WEBDNA_VERSION,
  redactSecrets,
  safeSnippet,
  type Assets,
  type EvidenceCoverage,
  type Finding,
  type Report,
  type ReportWarning,
  type ResourceRef,
  type StageId,
  type ViewportId,
  type ViewportObservation,
} from "@webdna/shared";
import {
  concludeAiOrigin,
  emptyCoverage,
  looksLikeBlockingPage,
  lowerKeys,
  parseStaticHtml,
  countSelectors,
  type DetectorRegistry,
  type EvidenceBundle,
  type StaticHtmlEvidence,
} from "@webdna/detectors";
import {
  extract,
  launchIsolatedBrowser,
  loadPage,
  newIsolatedContext,
  screenshot,
  type LoadedPage,
} from "./browser/session.js";
import { ScanFailure } from "./errors.js";
import { analyzeAccessibility, A11Y_CHECKS } from "./extract/accessibility.js";
import type { ViewportData } from "./extract/common.js";
import { analyzeLayout, detectComponents } from "./extract/components.js";
import { extractOutline } from "./extract/outline.js";
import { extractDesignSystem } from "./extract/design.js";
import { breakpointsBetween, compareViewports } from "./responsive/compare.js";
import { NetworkPolicy } from "./security/policy.js";
import { BLOCKED_HEADER, startFilteringProxy } from "./security/proxy.js";
import { effectivePort, normalizeTargetUrl } from "./security/url.js";
import { analyzeSources } from "./source/analyze.js";
import { parseColor, toHex } from "./extract/color.js";

export interface ScanLimits {
  navTimeoutMs: number;
  scanTimeoutMs: number;
  maxTotalBytes: number;
  maxRequests: number;
  maxRedirects: number;
  maxElements: number;
  maxText: number;
  maxHtmlBytes: number;
  maxCapturedFiles: number;
  maxCapturedFileBytes: number;
  maxCapturedTotalBytes: number;
  maxScreenshotHeight: number;
  maxSourceMaps: number;
  maxSourceMapBytes: number;
}

export const DEFAULT_LIMITS: ScanLimits = {
  navTimeoutMs: 30_000,
  scanTimeoutMs: 180_000,
  maxTotalBytes: 64 * 1024 * 1024,
  maxRequests: 600,
  maxRedirects: 10,
  maxElements: 4000,
  maxText: 40_000,
  maxHtmlBytes: 3_000_000,
  maxCapturedFiles: 80,
  maxCapturedFileBytes: 3_000_000,
  maxCapturedTotalBytes: 25_000_000,
  maxScreenshotHeight: 12_000,
  maxSourceMaps: 5,
  maxSourceMapBytes: 8_000_000,
};

export type StageListener = (
  stage: StageId,
  state: "running" | "done" | "failed" | "skipped",
  message?: string,
) => void;

export interface ScanInput {
  scanId: string;
  url: string;
  viewports: ViewportId[];
  /** Directory where screenshots are written. */
  outputDir: string;
  policy: NetworkPolicy;
  registry: DetectorRegistry;
  limits?: Partial<ScanLimits>;
  disabledDetectors?: string[];
  signal?: AbortSignal;
  onStage?: StageListener;
}

const VIEWPORT_ORDER: ViewportId[] = ["desktop", "tablet", "mobile"];

/**
 * Run one complete scan. Throws ScanFailure for expected failures; the caller
 * records the failed state. Every network connection made by the browser or the
 * source fetcher passes through the NetworkPolicy.
 */
export async function runScan(input: ScanInput): Promise<Report> {
  const limits = { ...DEFAULT_LIMITS, ...input.limits };
  const started = Date.now();
  const warnings: ReportWarning[] = [];
  const onStage: StageListener = input.onStage ?? (() => undefined);
  const viewports = VIEWPORT_ORDER.filter((v) => input.viewports.includes(v));
  if (viewports.length === 0) viewports.push("desktop");

  const controller = new AbortController();
  const timeout = setTimeout(
    () =>
      controller.abort(
        new ScanFailure("scan_timeout", `Scan exceeded ${limits.scanTimeoutMs} ms.`),
      ),
    limits.scanTimeoutMs,
  );
  const onAbort = () => controller.abort(new ScanFailure("cancelled", "Scan was cancelled."));
  input.signal?.addEventListener("abort", onAbort, { once: true });
  const signal = controller.signal;

  let browser: Browser | undefined;
  let proxy: Awaited<ReturnType<typeof startFilteringProxy>> | undefined;
  signal.addEventListener("abort", () => void browser?.close().catch(() => undefined), {
    once: true,
  });

  const stage = async <T>(
    id: StageId,
    fn: () => Promise<T>,
    message?: (r: T) => string | undefined,
  ): Promise<T> => {
    if (signal.aborted) throw signal.reason;
    onStage(id, "running");
    try {
      const r = await fn();
      if (signal.aborted) throw signal.reason;
      onStage(id, "done", message?.(r));
      return r;
    } catch (error) {
      const failure = signal.aborted ? (signal.reason as Error) : error;
      onStage(id, "failed", redact(failure instanceof Error ? failure.message : String(failure)));
      throw failure;
    }
  };

  try {
    // 1. Validate URL and destination.
    const target = await stage(
      "validating_url",
      async () => {
        const url = normalizeTargetUrl(input.url);
        const destination = await input.policy.validate(url.hostname, effectivePort(url));
        return { url, destination };
      },
      (r) => `${r.url.hostname} resolves to a public address`,
    );

    // 2. Launch isolated browser behind the filtering proxy.
    await stage(
      "launching_browser",
      async () => {
        proxy = await startFilteringProxy(input.policy, {
          maxTotalBytes: limits.maxTotalBytes,
          maxConnections: limits.maxRequests,
          socketTimeoutMs: limits.navTimeoutMs,
        });
        browser = await launchIsolatedBrowser(proxy.port);
      },
      () => "Chromium started; all traffic routed through the network-policy proxy",
    );

    const sessionLimits = { ...limits };
    const loaded = new Map<ViewportId, LoadedPage>();
    const data: ViewportData[] = [];
    const observations: ViewportObservation[] = [];
    await mkdir(input.outputDir, { recursive: true });

    // 3. Load the primary viewport.
    const primary = viewports[0]!;
    const first = await stage(
      "loading_page",
      async () => {
        const context = await newIsolatedContext(browser!, primary);
        try {
          return await loadPage(context, target.url.toString(), primary, sessionLimits, true);
        } catch (error) {
          throw mapNavigationError(error, proxy!, target.url.hostname);
        }
      },
      (r) =>
        `HTTP ${r.mainResponse?.status() ?? "?"} in ${r.loadMs} ms (${r.readiness.join(", ")})`,
    );
    loaded.set(primary, first);
    if (!first.mainResponse)
      throw new ScanFailure("navigation_failed", "The browser received no document response.");
    if (first.mainResponse.headers()[BLOCKED_HEADER]) {
      // A redirect led to a destination the policy refused; the 403 came from our own proxy.
      throw mapNavigationError(
        new ScanFailure("navigation_failed", "blocked"),
        proxy!,
        new URL(first.page.url()).hostname,
      );
    }
    if (first.redirectChain.length > limits.maxRedirects) {
      throw new ScanFailure("resource_limit", `More than ${limits.maxRedirects} redirects.`);
    }
    const status = first.mainResponse.status();
    if (status >= 400)
      warnings.push({
        code: "http_error",
        message: `The page responded with HTTP ${status}; the analysis describes that response.`,
      });
    const finalUrl = first.page.url();
    const headers = lowerKeys(await first.mainResponse.allHeaders().catch(() => ({})));
    let originalHtml: string | undefined;
    let htmlTruncated = false;
    try {
      const body = await first.mainResponse.body();
      htmlTruncated = body.length > limits.maxHtmlBytes;
      originalHtml = body.subarray(0, limits.maxHtmlBytes).toString("utf8");
    } catch {
      warnings.push({
        code: "html_unavailable",
        message: "The original HTML response body could not be read.",
      });
    }

    // 4. Screenshots + raw DOM/CSS measurements for each viewport.
    await stage(
      "capturing_screenshots",
      async () => {
        for (const vp of viewports) {
          let page = loaded.get(vp);
          if (!page) {
            const context = await newIsolatedContext(browser!, vp);
            try {
              page = await loadPage(context, finalUrl, vp, sessionLimits, false);
            } catch (error) {
              warnings.push({
                code: "viewport_failed",
                message: `The ${vp} viewport could not be loaded: ${(error as Error).message}`,
              });
              continue;
            }
            loaded.set(vp, page);
          }
          const raw = await extract(page.page, {
            maxElements: limits.maxElements,
            maxText: limits.maxText,
            maxInlineCss: 1_000_000,
            selectors: input.registry.requiredSelectors(),
            globals: input.registry.requiredGlobals(),
          });
          const shots = await screenshot(
            page.page,
            path.join(input.outputDir, `${vp}-viewport.jpg`),
            path.join(input.outputDir, `${vp}-full.jpg`),
            raw.docHeight,
            limits.maxScreenshotHeight,
          );
          await Promise.allSettled(page.pendingBodies);
          data.push({ id: vp, raw });
          observations.push({
            id: vp,
            width: raw.viewportWidth,
            height: raw.viewportHeight,
            documentWidth: raw.docWidth,
            documentHeight: raw.docHeight,
            horizontalOverflow: raw.docWidth > raw.viewportWidth + 1,
            elementCount: raw.elementCount,
            sampledElements: raw.elements.length,
            samplingTruncated: raw.truncated,
            screenshots: { viewport: `${vp}-viewport.jpg`, fullPage: `${vp}-full.jpg`, ...shots },
            consoleErrors: page.consoleErrors.map((e) => safeSnippet(e, 300)),
            failedRequests: page.network
              .filter((n) => n.failed)
              .slice(0, 30)
              .map((n) => ({ url: safeSnippet(n.url, 300), reason: n.failed! })),
            loadMs: page.loadMs,
            readiness: page.readiness,
          });
          if (raw.truncated)
            warnings.push({
              code: "sampling_truncated",
              message: `${vp}: only the first ${limits.maxElements} elements were measured.`,
            });
          if (page.requestLimitHit)
            warnings.push({
              code: "request_limit",
              message: `${vp}: the request limit (${limits.maxRequests}) was reached; later requests were blocked.`,
            });
          await page.page
            .context()
            .close()
            .catch(() => undefined);
        }
        if (data.length === 0)
          throw new ScanFailure("navigation_failed", "No viewport could be captured.");
      },
      () => `Captured ${data.map((d) => d.id).join(", ")}`,
    );

    if (proxy!.stats.budgetExceeded)
      warnings.push({
        code: "transfer_limit",
        message: `Transfer limit of ${limits.maxTotalBytes} bytes reached; remaining responses were cut off.`,
      });
    if (proxy!.blocked.length > 0) {
      warnings.push({
        code: "requests_blocked",
        message: `${proxy!.blocked.length} connection(s) were blocked by the network policy (e.g. ${proxy!.blocked[0]!.host}: ${proxy!.blocked[0]!.reason}).`,
      });
    }

    const primaryData = data.find((d) => d.id === primary) ?? data[0]!;
    const staticHtml: StaticHtmlEvidence | undefined = originalHtml
      ? parseStaticHtml(originalHtml, finalUrl)
      : undefined;

    // 5. Structure, components, accessibility, assets and static source analysis.
    const structure = await stage(
      "extracting_styles",
      async () => {
        const source = await analyzeSources({
          originalHtml,
          htmlTruncated,
          staticHtml,
          rendered: primaryData.raw,
          captured: first.captured,
          notCaptured: first.notCaptured,
          policy: input.policy,
          limits: {
            maxSourceMaps: limits.maxSourceMaps,
            maxSourceMapBytes: limits.maxSourceMapBytes,
            fetchTimeoutMs: 10_000,
          },
          signal,
        });
        const viewportMeta = primaryData.raw.meta.find(
          (m) => m.name?.toLowerCase() === "viewport",
        )?.content;
        return {
          source,
          components: detectComponents(primaryData),
          outline: extractOutline(data),
          layout: analyzeLayout(primaryData),
          accessibility: analyzeAccessibility(data, viewportMeta),
          assets: buildAssets(primaryData, [...loaded.values()], first, target.url.hostname),
          viewportMeta,
        };
      },
      (r) =>
        `${r.components.length} component patterns, ${r.source.analysis.css.filesInspected} CSS and ${r.source.analysis.js.filesInspected} JS files inspected`,
    );

    // 6. Design tokens and inferred roles.
    const design = await stage(
      "inferring_tokens",
      async () => extractDesignSystem(data, structure.source.customProperties),
      (d) =>
        `${d.colors.length} colours, ${d.typography.styles.length} text styles, ${d.roles.length} inferred roles`,
    );

    // 7. AI-origin / platform / template detectors.
    const aiOrigin = await stage(
      "evaluating_ai_origin",
      async () => {
        const bundle = buildBundle({
          finalUrl,
          headers,
          originalHtml,
          staticHtml,
          primary: primaryData,
          network: [...loaded.values()].flatMap((l) => l.network.map((n) => n.url)),
          source: structure.source,
          capturedScripts: first.captured.filter((c) => c.type === "script").length,
          totalScripts: first.network.filter((n) => n.type === "script").length,
          capturedCss: first.captured.filter((c) => c.type === "stylesheet").length,
          totalCss: first.network.filter((n) => n.type === "stylesheet").length,
          selectors: input.registry.requiredSelectors(),
          httpStatus: status,
        });
        const { findings, runs } = input.registry.run(bundle, {
          disabled: input.disabledDetectors,
        });
        return concludeAiOrigin(findings, bundle.coverage, runs, input.registry.ruleSetVersion);
      },
      (r) =>
        `${r.conclusionLabel} (${r.platformFindings.length} platform, ${r.aiFindings.length} AI-related, ${r.templateFindings.length} template findings)`,
    );
    structure.source.analysis.js.bundlerSignatures = aiOrigin.platformFindings
      .filter((f) => f.subjectType === "build_tool")
      .map((f) => ({
        name: f.subject ?? f.finding,
        evidence: f.evidence[0]?.value ?? f.evidence[0]?.location ?? "",
      }));

    // 8. Responsive comparison and source/runtime correlation.
    const responsive = await stage(
      "comparing_viewports",
      async () => {
        const changes = [];
        const notes: string[] = [];
        for (let i = 1; i < data.length; i += 1) {
          const a = data[i - 1]!,
            b = data[i]!;
          const c = compareViewports(a, b);
          changes.push(...c);
          const bps = breakpointsBetween(
            structure.source.breakpoints,
            a.raw.viewportWidth,
            b.raw.viewportWidth,
          );
          const layoutChanges = c.filter(
            (x) => x.kind !== "overflow" && x.kind !== "geometry",
          ).length;
          structure.source.analysis.correlations.push({
            topic: `Breakpoints between ${a.id} (${a.raw.viewportWidth}px) and ${b.id} (${b.raw.viewportWidth}px)`,
            status: bps.length > 0 && layoutChanges > 0 ? "consistent" : "unverifiable",
            sourceEvidence:
              bps.length > 0
                ? `Declared width breakpoints in range: ${bps.join(", ")}px`
                : "No width media query in this range found in inspected CSS",
            runtimeEvidence: `${layoutChanges} observed layout/visibility/typography change(s)`,
          });
        }
        if (data.length < 2) notes.push("Only one viewport was captured; no comparison possible.");
        addCorrelations(
          structure.source.analysis,
          aiOrigin.platformFindings,
          design,
          staticHtml,
          primaryData,
        );
        return { changes, notes };
      },
      (r) => `${r.changes.length} differences recorded`,
    );

    // 9. Assemble and validate the report.
    return await stage("generating_report", async () => {
      const report: Report = {
        schemaVersion: REPORT_SCHEMA_VERSION,
        generator: { name: "WebDNA", version: WEBDNA_VERSION },
        scanId: input.scanId,
        createdAt: new Date().toISOString(),
        durationMs: Date.now() - started,
        target: {
          // URLs are stored with credential-like query values redacted (the scan itself used the real URL).
          inputUrl: redact(input.url),
          normalizedUrl: redact(target.url.toString()),
          finalUrl: redact(finalUrl),
          domain: new URL(finalUrl).hostname,
          redirectChain: first.redirectChain.map((u) => safeSnippet(u, 500)),
          statusCode: status,
          contentType: headers["content-type"],
        },
        metadata: buildMetadata(primaryData, structure.viewportMeta),
        viewports: observations,
        design,
        layout: structure.layout,
        outline: structure.outline,
        components: structure.components,
        responsive: {
          changes: responsive.changes,
          breakpointsDeclared: structure.source.breakpoints,
          notes: responsive.notes,
        },
        accessibility: {
          checksRun: A11Y_CHECKS,
          issues: structure.accessibility,
          note: "Automated observations only; this is not a WCAG conformance audit.",
        },
        assets: structure.assets,
        source: structure.source.analysis,
        aiOrigin,
        warnings: warnings.map((w) => ({ ...w, message: redact(w.message) })),
        limits: { ...limits },
      };
      return ReportSchema.parse(report);
    });
  } catch (error) {
    // Error messages can embed the target URL (e.g. "net::ERR_… at https://…?token=…").
    const failure = signal.aborted ? signal.reason : error;
    if (failure instanceof ScanFailure)
      throw new ScanFailure(failure.code, redact(failure.message));
    throw new ScanFailure(
      "internal_error",
      redact(failure instanceof Error ? failure.message : String(failure)),
    );
  } finally {
    clearTimeout(timeout);
    input.signal?.removeEventListener("abort", onAbort);
    await browser?.close().catch(() => undefined);
    await proxy?.close().catch(() => undefined);
  }
}

function mapNavigationError(
  error: unknown,
  proxy: { blocked: { host: string; reason: string }[]; stats: { budgetExceeded: boolean } },
  host: string,
): unknown {
  if (!(error instanceof ScanFailure)) return error;
  const blocked = proxy.blocked;
  if (proxy.stats.budgetExceeded) {
    return new ScanFailure(
      "resource_limit",
      "The page exceeded the transfer limit for a single scan.",
    );
  }
  if (error.code === "navigation_failed" && blocked.length > 0) {
    const hit = blocked.find((b) => b.host === host) ?? blocked[0]!;
    return new ScanFailure(
      "blocked_destination",
      `Blocked by network policy: ${hit.host} — ${hit.reason}`,
    );
  }
  return error;
}

function buildMetadata(vp: ViewportData, viewportMeta: string | undefined): Report["metadata"] {
  const meta = vp.raw.meta;
  const get = (name: string) => meta.find((m) => m.name?.toLowerCase() === name)?.content;
  const og: Record<string, string> = {};
  for (const m of meta) {
    if (m.property?.startsWith("og:") && Object.keys(og).length < 12)
      og[m.property] = safeSnippet(m.content, 200);
  }
  return {
    title: vp.raw.title ? safeSnippet(vp.raw.title, 200) : undefined,
    description: get("description") ? safeSnippet(get("description")!, 300) : undefined,
    lang: vp.raw.lang,
    charset: vp.raw.charset,
    viewportMeta,
    canonical: redactUrl(vp.raw.links.find((l) => l.rel === "canonical")?.href),
    themeColor: get("theme-color"),
    generator: meta
      .filter((m) => m.name?.toLowerCase() === "generator")
      .map((m) => safeSnippet(m.content, 120)),
    openGraph: og,
    favicon: redactUrl(vp.raw.links.find((l) => l.rel.split(/\s+/).includes("icon"))?.href),
  };
}

function redact(text: string): string {
  return redactSecrets(text).text;
}

function redactUrl(url: string | undefined): string | undefined {
  return url === undefined ? undefined : safeSnippet(url, 500);
}

function baseDomain(host: string): string {
  // Approximation without the Public Suffix List; documented as such in the UI.
  return host.split(".").slice(-2).join(".");
}

function buildAssets(
  vp: ViewportData,
  pages: LoadedPage[],
  first: LoadedPage,
  host: string,
): Assets {
  const site = baseDomain(host);
  const third = (url: string) => {
    try {
      const h = new URL(url).hostname;
      return h !== host && baseDomain(h) !== site;
    } catch {
      return false;
    }
  };
  const images = vp.raw.elements
    .filter((e) => e.tag === "img" && e.a?.src)
    .slice(0, 100)
    .map((e) => ({
      src: safeSnippet(e.a!.src!, 300),
      naturalWidth: e.a!.nw ?? 0,
      naturalHeight: e.a!.nh ?? 0,
      renderedWidth: e.w,
      renderedHeight: e.h,
      hasAlt: (e.a!.alt ?? -1) >= 0,
      loading: e.a!.loading ?? undefined,
      format: /\.([a-z0-9]{3,4})(\?|$)/i.exec(e.a!.src!)?.[1]?.toLowerCase(),
      selector: e.sel,
    }));
  const captured = new Map(first.captured.map((c) => [c.url, c]));
  const notCaptured = new Map(first.notCaptured.map((c) => [c.url, c.reason]));
  const resources = (type: string): ResourceRef[] =>
    first.network
      .filter((n) => n.type === type && !n.failed)
      .slice(0, 80)
      .map((n) => ({
        url: safeSnippet(n.url, 300),
        type,
        status: n.status,
        bytes: captured.get(n.url)?.bytes ?? n.bytes,
        thirdParty: third(n.url),
        inspected: captured.has(n.url),
        notInspectedReason: captured.has(n.url)
          ? undefined
          : (notCaptured.get(n.url) ?? "not captured"),
      }));
  const domains = new Set<string>();
  for (const p of pages)
    for (const n of p.network) if (third(n.url)) domains.add(new URL(n.url).hostname);
  return {
    images,
    fonts: vp.raw.fonts,
    scripts: resources("script"),
    stylesheets: resources("stylesheet"),
    thirdPartyDomains: [...domains].sort().slice(0, 60),
  };
}

interface BundleInputs {
  finalUrl: string;
  headers: Record<string, string>;
  originalHtml?: string;
  staticHtml?: StaticHtmlEvidence;
  primary: ViewportData;
  network: string[];
  source: Awaited<ReturnType<typeof analyzeSources>>;
  capturedScripts: number;
  totalScripts: number;
  capturedCss: number;
  totalCss: number;
  selectors: string[];
  httpStatus: number;
}

/** Merge static-HTML, rendered-DOM, network and source observations into one bundle. */
function buildBundle(b: BundleInputs): EvidenceBundle {
  const raw = b.primary.raw;
  const s = b.staticHtml;
  const coverage: EvidenceCoverage = emptyCoverage();
  coverage.htmlInspected = !!b.originalHtml;
  coverage.renderedDomInspected = raw.elements.length > 0;
  coverage.scriptsInspected = b.capturedScripts;
  coverage.scriptsTotal = b.totalScripts;
  coverage.stylesheetsInspected = b.capturedCss;
  coverage.stylesheetsTotal = b.totalCss;
  coverage.visibleTextChars = raw.text.length;
  coverage.headersInspected = Object.keys(b.headers).length > 0;
  coverage.blockingPageSuspected =
    looksLikeBlockingPage(raw.title, raw.text) ||
    b.httpStatus === 403 ||
    b.httpStatus === 429 ||
    b.httpStatus === 503;
  if (b.capturedScripts < b.totalScripts)
    coverage.notes.push(`${b.totalScripts - b.capturedScripts} script(s) could not be inspected.`);
  if (coverage.blockingPageSuspected)
    coverage.notes.push("The response looks like a bot challenge or access-denied page.");

  const staticCounts = s ? countSelectors(s.document, b.selectors) : {};
  const selectorMatches: Record<string, number> = {};
  for (const sel of b.selectors)
    selectorMatches[sel] = Math.max(raw.selectorMatches[sel] ?? 0, staticCounts[sel] ?? 0);

  const dedupe = <T>(items: T[], key: (t: T) => string) => [
    ...new Map(items.map((i) => [key(i), i])).values(),
  ];
  return {
    finalUrl: b.finalUrl,
    hostname: new URL(b.finalUrl).hostname,
    title: raw.title || s?.title,
    headers: b.headers,
    html: b.originalHtml,
    htmlComments: s?.htmlComments ?? [],
    meta: dedupe([...(s?.meta ?? []), ...raw.meta], (m) => `${m.name}|${m.property}|${m.content}`),
    htmlAttributes: { ...(s?.htmlAttributes ?? {}), ...raw.htmlAttributes },
    scripts: dedupe(
      [...(s?.scripts ?? []), ...raw.scripts],
      (x) => x.src ?? `inline:${x.id}:${x.text?.slice(0, 50)}`,
    ),
    stylesheets: [
      ...new Set([
        ...(s?.stylesheets ?? []),
        ...raw.links.filter((l) => l.rel.split(/\s+/).includes("stylesheet")).map((l) => l.href),
      ]),
    ],
    links: dedupe([...(s?.links ?? []), ...raw.links], (l) => `${l.rel}|${l.href}`),
    assetUrls: [...new Set([...(s?.referencedUrls ?? []), ...b.network])].slice(0, 4000),
    anchors: raw.anchors,
    selectorMatches,
    runtimeGlobals: raw.runtimeGlobals,
    visibleText: raw.text,
    scriptSources: b.source.scriptSources,
    stylesheetSources: b.source.stylesheetSources,
    sourceMapPaths: b.source.sourceMapPaths,
    coverage,
  };
}

function addCorrelations(
  analysis: Report["source"],
  platformFindings: Finding[],
  design: Report["design"],
  staticHtml: StaticHtmlEvidence | undefined,
  primary: ViewportData,
): void {
  const SOURCE = new Set([
    "asset_path",
    "script_url",
    "stylesheet_url",
    "js_source",
    "css_source",
    "meta",
    "html_comment",
    "header",
  ]);
  const RUNTIME = new Set(["runtime_global", "dom_selector"]);
  for (const f of platformFindings.filter(
    (p) => p.subjectType === "framework" || p.subjectType === "library",
  )) {
    const src = f.evidence.filter((e) => SOURCE.has(e.type));
    const run = f.evidence.filter((e) => RUNTIME.has(e.type));
    analysis.correlations.push({
      topic: `${f.subject} fingerprint`,
      status: src.length > 0 && run.length > 0 ? "consistent" : "unverifiable",
      sourceEvidence:
        src.length > 0
          ? src
              .map((e) => `${e.type}: ${e.value ?? e.location}`)
              .slice(0, 2)
              .join("; ")
          : "No source-level marker matched",
      runtimeEvidence:
        run.length > 0
          ? run
              .map((e) => `${e.type}: ${e.location}`)
              .slice(0, 2)
              .join("; ")
          : "No runtime marker matched",
    });
  }

  const declared = new Set(
    design.customProperties
      .map((p) => parseColor(p.value))
      .filter((c): c is NonNullable<typeof c> => !!c)
      .map((c) => toHex(c)),
  );
  if (design.customProperties.length > 0) {
    const top = design.colors.slice(0, 10);
    const matched = top.filter((c) => declared.has(c.hex)).length;
    analysis.correlations.push({
      topic: "Measured colours vs declared custom properties",
      status: matched > 0 ? "consistent" : "unverifiable",
      sourceEvidence: `${design.customProperties.length} custom properties declared on :root/html (${declared.size} parse as plain colours)`,
      runtimeEvidence: `${matched} of the ${top.length} most used measured colours equal a declared colour value`,
    });
  }

  const staticText = staticHtml?.text.length ?? 0;
  const renderedText = primary.raw.text.length;
  if (renderedText > 200) {
    const ratio = staticText / renderedText;
    analysis.correlations.push({
      topic: "Server-rendered vs client-rendered content",
      status: "consistent",
      sourceEvidence: `${staticText} characters of text in the original HTML`,
      runtimeEvidence: `${renderedText} characters of visible text after rendering (${ratio < 0.2 ? "mostly rendered client-side" : "largely present in the HTML response"})`,
    });
  }
}
