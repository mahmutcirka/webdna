import { chromium, type Browser, type BrowserContext, type Page, type Response } from "playwright";
import { VIEWPORTS, type ViewportId } from "@webdna/shared";
import { ScanFailure } from "../errors.js";
import { EXTRACT_SCRIPT, type ExtractOptions, type RawExtraction } from "./extract-script.js";

export interface SessionLimits {
  navTimeoutMs: number;
  maxRequests: number;
  maxCapturedFiles: number;
  maxCapturedFileBytes: number;
  maxCapturedTotalBytes: number;
  maxScreenshotHeight: number;
}

/**
 * Launch Chromium with every request forced through the filtering proxy.
 * `<-loopback>` removes Chromium's implicit proxy bypass for localhost, so even
 * loopback requests are validated. QUIC and non-proxied WebRTC UDP are disabled so
 * no traffic can skip the proxy.
 */
export async function launchIsolatedBrowser(
  proxyPort: number,
  /** Extra Chromium switches; used by tests (e.g. --log-net-log) only. */
  extraArgs: string[] = [],
): Promise<Browser> {
  return chromium.launch({
    headless: true,
    proxy: { server: `http://127.0.0.1:${proxyPort}`, bypass: "<-loopback>" },
    args: [
      "--disable-quic",
      "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-default-apps",
      "--disable-extensions",
      "--disable-sync",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-features=DnsOverHttps,MediaRouter,OptimizationHints",
      // Chromium still issues its own host lookups for page hostnames (observed in its
      // net-log even in proxy mode). It never needs them — the proxy resolves and pins —
      // so every name except the proxy address fails locally and no DNS query leaves the
      // browser (prevents DNS-based exfiltration and internal-name probing).
      "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1",
      ...extraArgs,
    ],
  });
}

export async function newIsolatedContext(
  browser: Browser,
  viewport: ViewportId,
): Promise<BrowserContext> {
  const size = VIEWPORTS[viewport];
  const mobile = viewport !== "desktop";
  const context = await browser.newContext({
    viewport: size,
    deviceScaleFactor: 1,
    isMobile: mobile,
    hasTouch: mobile,
    acceptDownloads: false,
    serviceWorkers: "block",
    permissions: [],
    locale: "en-US",
    reducedMotion: "reduce",
    javaScriptEnabled: true,
  });
  return context;
}

export interface CapturedSource {
  url: string;
  type: "stylesheet" | "script" | "manifest";
  status: number;
  bytes: number;
  text: string;
}

export interface NetworkRecord {
  url: string;
  type: string;
  status?: number;
  bytes?: number;
  failed?: string;
}

export interface LoadedPage {
  page: Page;
  viewport: ViewportId;
  mainResponse: Response | null;
  redirectChain: string[];
  loadMs: number;
  readiness: string[];
  consoleErrors: string[];
  network: NetworkRecord[];
  captured: CapturedSource[];
  notCaptured: { url: string; reason: string }[];
  pendingBodies: Promise<void>[];
  requestLimitHit: boolean;
}

/**
 * Navigate a fresh page and wait for meaningful readiness signals (load, a short
 * network-idle window, web fonts) instead of fixed sleeps. Then scroll through the
 * page once so lazy-loaded content is rendered.
 */
export async function loadPage(
  context: BrowserContext,
  url: string,
  viewport: ViewportId,
  limits: SessionLimits,
  captureSources: boolean,
): Promise<LoadedPage> {
  const page = await context.newPage();
  page.setDefaultTimeout(limits.navTimeoutMs);
  const result: LoadedPage = {
    page,
    viewport,
    mainResponse: null,
    redirectChain: [],
    loadMs: 0,
    readiness: [],
    consoleErrors: [],
    network: [],
    captured: [],
    notCaptured: [],
    pendingBodies: [],
    requestLimitHit: false,
  };

  let requestCount = 0;
  await context.route("**/*", async (route) => {
    const reqUrl = route.request().url();
    if (!/^(https?|data|blob):/i.test(reqUrl)) return route.abort("blockedbyclient");
    requestCount += 1;
    if (requestCount > limits.maxRequests) {
      result.requestLimitHit = true;
      return route.abort("blockedbyclient");
    }
    return route.continue();
  });

  page.on("console", (msg) => {
    if (msg.type() === "error" && result.consoleErrors.length < 20) {
      result.consoleErrors.push(msg.text().slice(0, 300));
    }
  });
  page.on("pageerror", (err) => {
    if (result.consoleErrors.length < 20)
      result.consoleErrors.push(`Uncaught: ${err.message.slice(0, 280)}`);
  });
  page.on("requestfailed", (req) => {
    if (result.network.length < 1500) {
      result.network.push({
        url: req.url(),
        type: req.resourceType(),
        failed: req.failure()?.errorText ?? "failed",
      });
    }
  });

  let capturedTotal = 0;
  page.on("response", (response) => {
    const req = response.request();
    const type = req.resourceType();
    const lengthHeader = Number(response.headers()["content-length"] ?? NaN);
    if (result.network.length < 1500) {
      result.network.push({
        url: response.url(),
        type,
        status: response.status(),
        bytes: Number.isFinite(lengthHeader) ? lengthHeader : undefined,
      });
    }
    if (!captureSources) return;
    if (type !== "stylesheet" && type !== "script" && type !== "manifest") return;
    if (!/^https?:/.test(response.url())) return;
    if (result.captured.length + result.pendingBodies.length >= limits.maxCapturedFiles) {
      result.notCaptured.push({ url: response.url(), reason: "file count limit reached" });
      return;
    }
    if (Number.isFinite(lengthHeader) && lengthHeader > limits.maxCapturedFileBytes) {
      result.notCaptured.push({
        url: response.url(),
        reason: `larger than ${limits.maxCapturedFileBytes} bytes`,
      });
      return;
    }
    result.pendingBodies.push(
      response
        .body()
        .then((body) => {
          if (body.length > limits.maxCapturedFileBytes) {
            result.notCaptured.push({
              url: response.url(),
              reason: `larger than ${limits.maxCapturedFileBytes} bytes`,
            });
            return;
          }
          if (capturedTotal + body.length > limits.maxCapturedTotalBytes) {
            result.notCaptured.push({ url: response.url(), reason: "total source budget reached" });
            return;
          }
          capturedTotal += body.length;
          result.captured.push({
            url: response.url(),
            type: type as CapturedSource["type"],
            status: response.status(),
            bytes: body.length,
            text: body.toString("utf8"),
          });
        })
        .catch(() => {
          result.notCaptured.push({
            url: response.url(),
            reason: "response body unavailable (redirect, cache or aborted)",
          });
        }),
    );
  });

  const started = Date.now();
  try {
    result.mainResponse = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: limits.navTimeoutMs,
    });
    result.readiness.push("domcontentloaded");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/timeout/i.test(message))
      throw new ScanFailure(
        "navigation_timeout",
        `The page did not load within ${limits.navTimeoutMs} ms.`,
      );
    throw new ScanFailure("navigation_failed", `Navigation failed: ${firstLine(message)}`);
  }

  await page
    .waitForLoadState("load", { timeout: Math.min(15_000, limits.navTimeoutMs) })
    .then(() => result.readiness.push("load"))
    .catch(() => result.readiness.push("load event timed out"));
  await page
    .waitForLoadState("networkidle", { timeout: 5_000 })
    .then(() => result.readiness.push("network idle"))
    .catch(() => result.readiness.push("network not idle after 5s"));
  await evaluateIsolated<boolean>(
    page,
    "Promise.race([document.fonts.ready.then(() => true), new Promise(r => setTimeout(() => r(false), 3000))])",
    5_000,
  )
    .then((ok) => result.readiness.push(ok ? "fonts ready" : "fonts not ready after 3s"))
    .catch(() => result.readiness.push("font readiness unavailable"));
  await scrollThrough(page)
    .then(() => result.readiness.push("scrolled for lazy content"))
    .catch(() => result.readiness.push("lazy-content scroll timed out"));
  result.loadMs = Date.now() - started;

  // Redirect chain of the main document.
  const chain: string[] = [];
  let req = result.mainResponse?.request().redirectedFrom() ?? null;
  while (req && chain.length < 20) {
    chain.unshift(req.url());
    req = req.redirectedFrom();
  }
  result.redirectChain = chain;
  return result;
}

async function scrollThrough(page: Page): Promise<void> {
  await evaluateIsolated(
    page,
    `(async () => {
    const step = Math.max(400, Math.floor(window.innerHeight * 0.9));
    const limit = Math.min(document.documentElement.scrollHeight, 20000);
    for (let y = 0; y < limit; y += step) {
      window.scrollTo(0, y);
      await new Promise(r => setTimeout(r, 60));
    }
    window.scrollTo(0, 0);
    await new Promise(r => setTimeout(r, 150));
  })()`,
    10_000,
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms} ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/**
 * Evaluate an expression in a fresh isolated world (CDP Page.createIsolatedWorld).
 * The DOM is shared, but JavaScript globals and built-in prototypes are not, so page
 * scripts cannot override getComputedStyle, String.prototype, document.fonts, etc. to
 * forge measurements or stall the scan. A Node-side timeout bounds every call.
 */
export async function evaluateIsolated<T>(
  page: Page,
  expression: string,
  timeoutMs: number,
): Promise<T> {
  const cdp = await page.context().newCDPSession(page);
  try {
    return await withTimeout(
      (async () => {
        const { frameTree } = await cdp.send("Page.getFrameTree");
        const { executionContextId } = await cdp.send("Page.createIsolatedWorld", {
          frameId: frameTree.frame.id,
          worldName: "webdna-measure",
        });
        const res = await cdp.send("Runtime.evaluate", {
          expression,
          contextId: executionContextId,
          returnByValue: true,
          awaitPromise: true,
        });
        if (res.exceptionDetails) {
          throw new Error(`In-page evaluation failed: ${res.exceptionDetails.text}`.slice(0, 300));
        }
        return res.result.value as T;
      })(),
      timeoutMs,
      "In-page evaluation",
    );
  } finally {
    await cdp.detach().catch(() => undefined);
  }
}

export async function extract(page: Page, options: ExtractOptions): Promise<RawExtraction> {
  // Measurements run isolated from page scripts.
  const raw = await evaluateIsolated<RawExtraction>(
    page,
    `(${EXTRACT_SCRIPT})(${JSON.stringify({ ...options, globals: [] })})`,
    30_000,
  );
  // Runtime globals only exist in the page's own world. A page can lie about them
  // (as it can about any marker); the check is bounded and returns booleans only.
  raw.runtimeGlobals = await withTimeout(
    page.evaluate(
      (names: string[]) => {
        const out: Record<string, boolean> = {};
        for (const n of names) out[n] = n in globalThis;
        return out;
      },
      options.globals.slice(0, 200),
    ),
    5_000,
    "Runtime-global check",
  ).catch(() => ({}));
  return raw;
}

export async function screenshot(
  page: Page,
  viewportPath: string,
  fullPagePath: string,
  docHeight: number,
  maxHeight: number,
): Promise<{ fullPageTruncated: boolean; fullPageHeight: number }> {
  await page.screenshot({ path: viewportPath, type: "jpeg", quality: 80, timeout: 20_000 });
  const width = page.viewportSize()?.width ?? 1440;
  const height = Math.min(docHeight, maxHeight);
  await page.screenshot({
    path: fullPagePath,
    type: "jpeg",
    quality: 70,
    fullPage: true,
    clip: { x: 0, y: 0, width, height },
    timeout: 20_000,
  });
  return { fullPageTruncated: docHeight > maxHeight, fullPageHeight: height };
}

function firstLine(s: string): string {
  return s
    .split("\n")[0]!
    .replace(/^page\.goto:\s*/, "")
    .slice(0, 300);
}
