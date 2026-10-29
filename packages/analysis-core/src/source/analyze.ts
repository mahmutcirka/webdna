import { safeSnippet, type CustomProperty, type SourceAnalysis } from "@webdna/shared";
import type { SourceFile, StaticHtmlEvidence } from "@webdna/detectors";
import type { RawExtraction } from "../browser/extract-script.js";
import type { CapturedSource } from "../browser/session.js";
import type { NetworkPolicy } from "../security/policy.js";
import { safeFetch } from "../security/safe-fetch.js";
import { analyzeCss, classifyClassNames, type CssFileResult } from "./css.js";
import { analyzeJs, summarizeSourcePaths, type JsFileResult } from "./js.js";

export interface SourceInputs {
  originalHtml?: string;
  htmlTruncated: boolean;
  staticHtml?: StaticHtmlEvidence;
  rendered: RawExtraction;
  captured: CapturedSource[];
  notCaptured: { url: string; reason: string }[];
  policy: NetworkPolicy;
  limits: { maxSourceMaps: number; maxSourceMapBytes: number; fetchTimeoutMs: number };
  signal?: AbortSignal;
}

export interface SourceOutputs {
  analysis: SourceAnalysis;
  customProperties: CustomProperty[];
  scriptSources: SourceFile[];
  stylesheetSources: SourceFile[];
  sourceMapPaths: { mapUrl: string; sources: string[] }[];
  breakpoints: number[];
}

/**
 * Static analysis of publicly served frontend files that the browser already
 * downloaded. Files are parsed as data, never executed. Only public source-map
 * files explicitly referenced by a script (same origin) are fetched, through the
 * same SSRF-safe fetcher, and only their file paths are kept.
 */
export async function analyzeSources(input: SourceInputs): Promise<SourceOutputs> {
  const limitations: string[] = [
    "Only files the page itself loaded are inspected; server-side source code is never accessible from a public URL.",
  ];
  const cssResults: CssFileResult[] = [];
  const jsResults: JsFileResult[] = [];
  const stylesheetSources: SourceFile[] = [];
  const scriptSources: SourceFile[] = [];

  for (const file of input.captured) {
    if (file.type === "stylesheet") {
      const r = analyzeCss(file.url, file.text);
      cssResults.push(r);
      stylesheetSources.push({ url: file.url, text: file.text, comments: r.comments });
    } else if (file.type === "script") {
      const r = analyzeJs(file.url, file.text);
      jsResults.push(r);
      scriptSources.push({ url: file.url, text: file.text, comments: r.comments });
    }
  }
  input.rendered.inlineStyles.forEach((text, i) => {
    const url = `inline <style> #${i + 1}`;
    const r = analyzeCss(url, text);
    cssResults.push(r);
    stylesheetSources.push({ url, text, comments: r.comments });
  });
  (input.staticHtml?.scripts ?? []).forEach((s, i) => {
    if (s.inline && s.text && s.text.length > 0 && (!s.type || /javascript|module/.test(s.type))) {
      const url = `inline <script> #${i + 1}`;
      const r = analyzeJs(url, s.text);
      jsResults.push(r);
      scriptSources.push({ url, text: s.text, comments: r.comments });
    }
  });

  // Source maps.
  const sourceMaps: SourceAnalysis["js"]["sourceMaps"] = [];
  const sourceMapPaths: { mapUrl: string; sources: string[] }[] = [];
  for (const js of jsResults) {
    if (!js.sourceMappingUrl || !/^https?:/.test(js.url)) continue;
    if (sourceMaps.length >= input.limits.maxSourceMaps) {
      sourceMaps.push({
        script: js.url,
        mapUrl: js.sourceMappingUrl.slice(0, 200),
        status: "skipped",
      });
      continue;
    }
    if (js.sourceMappingUrl.startsWith("data:")) {
      const parsed = parseInlineMap(js.sourceMappingUrl);
      if (parsed) {
        sourceMapPaths.push({ mapUrl: `${js.url} (inline map)`, sources: parsed });
        sourceMaps.push({
          script: js.url,
          mapUrl: "inline data: URL",
          status: "parsed",
          sourcesCount: parsed.length,
          topDirectories: summarizeSourcePaths(parsed),
        });
      } else sourceMaps.push({ script: js.url, mapUrl: "inline data: URL", status: "invalid" });
      continue;
    }
    let mapUrl: URL;
    try {
      mapUrl = new URL(js.sourceMappingUrl, js.url);
    } catch {
      sourceMaps.push({
        script: js.url,
        mapUrl: js.sourceMappingUrl.slice(0, 200),
        status: "invalid",
      });
      continue;
    }
    if (mapUrl.origin !== new URL(js.url).origin) {
      sourceMaps.push({ script: js.url, mapUrl: mapUrl.toString(), status: "skipped" });
      continue;
    }
    try {
      const res = await safeFetch(mapUrl.toString(), input.policy, {
        maxBytes: input.limits.maxSourceMapBytes,
        timeoutMs: input.limits.fetchTimeoutMs,
        maxRedirects: 2,
        signal: input.signal,
      });
      if (res.status !== 200) {
        sourceMaps.push({
          script: js.url,
          mapUrl: mapUrl.toString(),
          status: res.status === 403 || res.status === 401 ? "blocked" : "not_found",
        });
        continue;
      }
      if (res.truncated) {
        sourceMaps.push({ script: js.url, mapUrl: mapUrl.toString(), status: "too_large" });
        continue;
      }
      const sources = parseMapSources(res.body.toString("utf8"));
      if (!sources) {
        sourceMaps.push({ script: js.url, mapUrl: mapUrl.toString(), status: "invalid" });
        continue;
      }
      sourceMapPaths.push({ mapUrl: mapUrl.toString(), sources });
      sourceMaps.push({
        script: js.url,
        mapUrl: mapUrl.toString(),
        status: "parsed",
        sourcesCount: sources.length,
        topDirectories: summarizeSourcePaths(sources),
      });
    } catch {
      sourceMaps.push({ script: js.url, mapUrl: mapUrl.toString(), status: "blocked" });
    }
  }

  const mediaCounts = new Map<string, number>();
  for (const q of cssResults.flatMap((c) => c.mediaQueries))
    mediaCounts.set(q, (mediaCounts.get(q) ?? 0) + 1);
  const breakpoints = [...new Set(cssResults.flatMap((c) => c.breakpointsPx))].sort(
    (a, b) => a - b,
  );
  const customProperties = dedupeCustomProps(cssResults.flatMap((c) => c.customProperties)).slice(
    0,
    300,
  );

  const classAttrs = input.rendered.elements.map((e) => e.cls ?? "").filter(Boolean);
  const html = input.staticHtml;
  const notableHtmlComments = (html?.htmlComments ?? [])
    .filter((c) => c.length > 3 && !/^\[if |^<!\[endif|^\s*$/.test(c))
    .slice(0, 15)
    .map((c) => safeSnippet(c, 200));

  if (jsResults.some((j) => j.minifiedLikely))
    limitations.push(
      "Most JavaScript is minified or bundled; identifiers and comments may have been removed.",
    );
  if (input.notCaptured.length > 0)
    limitations.push(
      `${input.notCaptured.length} script/stylesheet response(s) could not be inspected.`,
    );
  if (!input.originalHtml) limitations.push("The original HTML response body was not available.");
  limitations.push(
    "Styles injected through the CSSOM (e.g. some CSS-in-JS runtimes) are not visible as source text.",
  );

  let redacted = 0;
  const countRedactions = (s: string) => {
    if (s.includes("[redacted]")) redacted += (s.match(/\[redacted\]/g) ?? []).length;
  };
  [
    ...notableHtmlComments,
    ...cssResults.flatMap((c) => c.comments),
    ...jsResults.flatMap((j) => j.comments),
  ].forEach(countRedactions);

  const manifestFile = input.captured.find((f) => f.type === "manifest");
  let manifest: SourceAnalysis["manifest"];
  const manifestLink = html?.links.find((l) => l.rel.split(/\s+/).includes("manifest"));
  if (manifestFile || manifestLink) {
    manifest = { url: manifestFile?.url ?? manifestLink!.href, fetched: !!manifestFile };
    if (manifestFile) {
      try {
        const json = JSON.parse(manifestFile.text) as { name?: unknown; short_name?: unknown };
        if (typeof json.name === "string") manifest.name = safeSnippet(json.name, 80);
        if (typeof json.short_name === "string")
          manifest.shortName = safeSnippet(json.short_name, 40);
      } catch {
        /* not JSON */
      }
    }
  }

  const analysis: SourceAnalysis = {
    html: {
      inspected: !!input.originalHtml,
      bytes: input.originalHtml?.length ?? 0,
      truncated: input.htmlTruncated,
      commentCount: html?.htmlComments.length ?? 0,
      notableComments: notableHtmlComments,
      generatorMeta: (html?.meta ?? [])
        .filter((m) => m.name?.toLowerCase() === "generator")
        .map((m) => safeSnippet(m.content, 120)),
      inlineScripts: html?.scripts.filter((s) => s.inline).length ?? 0,
      inlineStyles: html?.inlineStyles.length ?? 0,
      externalScripts: html?.scripts.filter((s) => s.src).length ?? 0,
      externalStylesheets: html?.stylesheets.length ?? 0,
      dataAttributePrefixes: Object.entries(input.rendered.dataPrefixes)
        .map(([prefix, count]) => ({ prefix, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 15),
      serverRenderedContent: (html?.text.length ?? 0) >= 200,
    },
    css: {
      filesInspected: cssResults.length,
      totalBytes: cssResults.reduce((n, c) => n + c.bytes, 0),
      ruleCount: cssResults.reduce((n, c) => n + c.rules, 0),
      customPropertyCount: cssResults.reduce((n, c) => n + c.customProperties.length, 0),
      mediaQueries: [...mediaCounts.entries()]
        .map(([query, count]) => ({ query, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 30),
      breakpointsPx: breakpoints,
      fontFaces: [...new Set(cssResults.flatMap((c) => c.fontFaces))].slice(0, 30),
      namingConventions: classifyClassNames(classAttrs),
      notableComments: [...new Set(cssResults.flatMap((c) => c.comments))].slice(0, 12),
      parseErrors: cssResults.reduce((n, c) => n + c.parseErrors, 0),
    },
    js: {
      filesInspected: jsResults.length,
      totalBytes: jsResults.reduce((n, j) => n + j.bytes, 0),
      parsed: jsResults.filter((j) => j.parsed).length,
      parseFailures: jsResults.filter((j) => !j.parsed).length,
      minifiedLikely: jsResults.filter((j) => j.minifiedLikely).length,
      moduleScripts: jsResults.filter((j) => j.module).length,
      bundlerSignatures: [],
      libraryBanners: jsResults
        .flatMap((j) =>
          j.banners.slice(0, 3).map((banner) => ({ file: safeSnippet(j.url, 300), banner })),
        )
        .slice(0, 20),
      // URLs may carry signed query strings; store them redacted and truncated.
      sourceMaps: sourceMaps.map((m) => ({
        ...m,
        script: safeSnippet(m.script, 300),
        mapUrl: safeSnippet(m.mapUrl, 300),
      })),
    },
    manifest,
    notInspected: input.notCaptured
      .slice(0, 50)
      .map((n) => ({ url: safeSnippet(n.url, 300), reason: n.reason })),
    correlations: [],
    redactedSecrets: redacted,
    limitations,
  };

  return {
    analysis,
    customProperties,
    scriptSources,
    stylesheetSources,
    sourceMapPaths,
    breakpoints,
  };
}

function parseMapSources(text: string): string[] | undefined {
  try {
    const json = JSON.parse(text) as {
      sources?: unknown;
      sections?: { map?: { sources?: unknown } }[];
    };
    const sources = Array.isArray(json.sources)
      ? json.sources
      : (json.sections ?? []).flatMap((s) => (Array.isArray(s.map?.sources) ? s.map!.sources : []));
    return (sources as unknown[])
      .filter((s): s is string => typeof s === "string")
      .slice(0, 20_000);
  } catch {
    return undefined;
  }
}

function parseInlineMap(dataUrl: string): string[] | undefined {
  const m = /^data:application\/json[^,]*?(;base64)?,(.*)$/i.exec(dataUrl);
  if (!m || m[2]!.length > 4_000_000) return undefined;
  try {
    const text = m[1] ? Buffer.from(m[2]!, "base64").toString("utf8") : decodeURIComponent(m[2]!);
    return parseMapSources(text);
  } catch {
    return undefined;
  }
}

function dedupeCustomProps(props: CustomProperty[]): CustomProperty[] {
  const seen = new Map<string, CustomProperty>();
  for (const p of props) seen.set(`${p.name}|${p.selector}`, p);
  return [...seen.values()];
}
