import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ReportSchema, buildRebuildPrompt, type Report } from "@webdna/shared";
import { createDefaultRegistry } from "@webdna/detectors";
import {
  NetworkPolicy,
  ScanFailure,
  compareReports,
  exportCssVariables,
  exportEvidenceZip,
  exportJson,
  exportMarkdown,
  exportTailwindTheme,
  runScan,
} from "@webdna/analysis-core";
import { startFixtureServer, type FixtureServer } from "./fixture-server.js";

const registry = createDefaultRegistry();
const tmp = mkdtempSync(path.join(os.tmpdir(), "webdna-it-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

/** Only the fixture server is reachable; every other hostname fails DNS, so tests never touch the internet. */
function policyFor(server: FixtureServer) {
  return new NetworkPolicy({
    unsafeAllowLoopback: [`127.0.0.1:${server.port}`],
    resolver: async () => {
      throw new Error("ENOTFOUND (offline test resolver)");
    },
  });
}

async function scan(
  server: FixtureServer,
  url: string,
  extra: Partial<Parameters<typeof runScan>[0]> = {},
) {
  const id = `it-${Math.random().toString(36).slice(2, 8)}`;
  const stages: string[] = [];
  const report = await runScan({
    scanId: id,
    url,
    viewports: ["desktop", "tablet", "mobile"],
    outputDir: path.join(tmp, id),
    policy: policyFor(server),
    registry,
    onStage: (s, state) => stages.push(`${s}:${state}`),
    ...extra,
  });
  return { report, stages, dir: path.join(tmp, id) };
}

async function expectFailure(p: Promise<unknown>, code: string) {
  try {
    await p;
    expect.unreachable("scan should have failed");
  } catch (e) {
    expect(e).toBeInstanceOf(ScanFailure);
    expect((e as ScanFailure).code).toBe(code);
  }
}

describe("full browser scan of a local fixture", () => {
  let server: FixtureServer;
  let result: Awaited<ReturnType<typeof scan>>;
  beforeAll(async () => {
    server = await startFixtureServer("basic-landing");
    result = await scan(server, server.url);
  });
  afterAll(() => server.close());

  it("runs every stage in order and produces a schema-valid report", () => {
    expect(result.stages.filter((s) => s.endsWith(":done")).map((s) => s.split(":")[0])).toEqual([
      "validating_url",
      "launching_browser",
      "loading_page",
      "capturing_screenshots",
      "extracting_styles",
      "inferring_tokens",
      "evaluating_ai_origin",
      "comparing_viewports",
      "generating_report",
    ]);
    expect(() => ReportSchema.parse(result.report)).not.toThrow();
    expect(result.report.target.statusCode).toBe(200);
  });

  it("captures real screenshots for all three viewports", () => {
    expect(result.report.viewports.map((v) => [v.id, v.width])).toEqual([
      ["desktop", 1440],
      ["tablet", 768],
      ["mobile", 390],
    ]);
    for (const v of result.report.viewports) {
      const file = path.join(result.dir, v.screenshots.viewport);
      expect(existsSync(file)).toBe(true);
      expect(readFileSync(file).subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8])); // JPEG magic
    }
  });

  it("extracts measured design tokens from computed styles", () => {
    const d = result.report.design;
    expect(d.colors.map((c) => c.hex)).toEqual(
      expect.arrayContaining(["#2f6f4e", "#1f2933", "#fbfaf7"]),
    );
    expect(d.typography.families.map((f) => f.family)).toEqual(
      expect.arrayContaining(["Georgia", "system-ui"]),
    );
    expect(d.typography.sizeScalePx).toEqual(expect.arrayContaining([48, 20, 16]));
    expect(d.radii.map((r) => r.value)).toEqual(expect.arrayContaining(["8px", "12px", "9999px"]));
    expect(d.customProperties.map((p) => p.name)).toEqual(
      expect.arrayContaining(["--nw-accent", "--nw-ink"]),
    );
    expect(d.roles.find((r) => r.role === "page background")?.value).toBe("#fbfaf7");
    expect(d.roles.find((r) => r.role === "accent / primary action")?.value).toBe("#2f6f4e");
  });

  it("outlines the page section by section", () => {
    const outline = result.report.outline!;
    expect(outline.map((s) => s.kind)).toEqual([
      "header",
      "hero",
      "card_grid",
      "media",
      "form",
      "footer",
    ]);
    expect(outline[1]!.content.headings[0]).toMatchObject({ level: 1, sizePx: 48 });
    expect(outline[2]!.cards).toMatchObject({ count: 3, columnsDesktop: 3, columnsMobile: 1 });
    expect(JSON.stringify(outline)).not.toContain("Northwind");
  });

  it("detects component patterns", () => {
    const kinds = new Set(result.report.components.map((c) => c.kind));
    for (const k of [
      "header",
      "navigation",
      "button",
      "card",
      "input",
      "form",
      "footer",
      "badge",
    ]) {
      if (k === "badge") continue; // only one badge in the fixture; badges need 2+ to count as a pattern
      expect(kinds).toContain(k);
    }
    expect(result.report.components.find((c) => c.kind === "card")!.count).toBe(3);
  });

  it("observes responsive changes from real viewports", () => {
    const changes = result.report.responsive.changes;
    expect(changes.some((c) => c.kind === "columns" && c.before === "3" && c.after === "1")).toBe(
      true,
    );
    expect(changes.some((c) => c.kind === "navigation")).toBe(true);
    expect(
      changes.some((c) => c.kind === "typography" && c.before === "48px" && c.after === "32px"),
    ).toBe(true);
    expect(result.report.responsive.breakpointsDeclared).toContain(767);
    expect(
      result.report.source.correlations.some(
        (c) => c.status === "consistent" && c.topic.startsWith("Breakpoints"),
      ),
    ).toBe(true);
  });

  it("reports basic accessibility observations", () => {
    const checks = result.report.accessibility.issues.map((i) => i.check);
    expect(checks).toEqual(
      expect.arrayContaining([
        "image alternative text",
        "form control labels",
        "text contrast (solid backgrounds only)",
      ]),
    );
  });

  it("analyses source files the page loaded", () => {
    const s = result.report.source;
    expect(s.html.inspected).toBe(true);
    expect(s.css.filesInspected).toBeGreaterThanOrEqual(1);
    expect(s.js.filesInspected).toBeGreaterThanOrEqual(1);
    expect(s.js.libraryBanners.some((b) => b.banner.includes("northwind-fixture v1.0.0"))).toBe(
      true,
    );
    // Hand-written CSS: must not be classified as utility-class styling.
    expect(s.css.namingConventions.some((n) => n.convention.startsWith("Utility"))).toBe(false);
  });

  it("finds no AI-origin evidence on a hand-written page", () => {
    expect(result.report.aiOrigin.conclusion).toBe("no_meaningful_evidence");
    expect(result.report.aiOrigin.aiFindings).toEqual([]);
    expect(result.report.aiOrigin.coverage.renderedDomInspected).toBe(true);
  });

  it("generates JSON, CSS, Tailwind, Markdown and evidence exports from the real report", () => {
    const r = result.report;
    expect(ReportSchema.parse(JSON.parse(exportJson(r))).scanId).toBe(r.scanId);
    const css = exportCssVariables(r);
    expect(css).toMatch(/--webdna-color-\d+: #2f6f4e;/);
    expect(css).toContain("--nw-accent: #2f6f4e;");
    const tw = exportTailwindTheme(r);
    expect(tw).toContain("@theme {");
    expect(tw).toMatch(/--color-observed-\d+: #2f6f4e;/);
    const md = exportMarkdown(r);
    expect(md).toContain("## AI-origin analysis");
    expect(md).toContain("No meaningful AI-origin evidence found");
    const zip = exportEvidenceZip(r, {
      "desktop-viewport.jpg": readFileSync(path.join(result.dir, "desktop-viewport.jpg")),
    });
    expect(zip.subarray(0, 2)).toEqual(new Uint8Array([0x50, 0x4b])); // "PK"
    const prompt = buildRebuildPrompt(r, { stack: "nextjs-tailwind", language: "en" });
    expect(prompt).toContain("--color-accent: #2f6f4e;");
    expect(prompt).toMatch(/### 5.3 Card grid/);
    expect(prompt).not.toContain("Northwind");
  });

  it("compares two scans of the same page", async () => {
    const second = await scan(server, server.url);
    const cmp = compareReports(result.report, second.report);
    expect(cmp.sameTarget).toBe(true);
    expect(cmp.ruleSetChanged).toBe(false);
    expect(cmp.detectorVersionChanges).toEqual([]);
    expect(cmp.colors.removed).toEqual([]);
  });
});

describe("AI-origin evidence through the browser pipeline", () => {
  it("reports the Lovable marker and records the blocked external script", async () => {
    const server = await startFixtureServer("generator-marker");
    try {
      const { report } = await scan(server, server.url, { viewports: ["desktop"] });
      expect(report.aiOrigin.conclusion).toBe("strong_ai_evidence");
      expect(report.aiOrigin.platformIdentification.platforms.map((p) => p.name)).toContain(
        "Lovable (formerly GPT Engineer)",
      );
      expect(report.warnings.some((w) => w.code === "requests_blocked")).toBe(true);
    } finally {
      await server.close();
    }
  });

  it("keeps framework-only pages free of AI findings", async () => {
    const server = await startFixtureServer("framework-only");
    try {
      const { report } = await scan(server, server.url, { viewports: ["desktop"] });
      const platforms = report.aiOrigin.platformIdentification.platforms.map((p) => p.name);
      expect(platforms).toEqual(expect.arrayContaining(["Next.js", "React", "Tailwind CSS"]));
      expect(report.aiOrigin.aiFindings).toEqual([]);
      expect(report.aiOrigin.conclusion).toBe("no_meaningful_evidence");
      expect(report.source.css.namingConventions[0]?.convention).toMatch(/Utility/);
    } finally {
      await server.close();
    }
  });
});

describe("safety controls and failure handling", () => {
  let server: FixtureServer;
  beforeAll(async () => {
    server = await startFixtureServer("basic-landing");
  });
  afterAll(() => server.close());

  it("rejects private destinations before launching a browser", async () => {
    const stages: string[] = [];
    await expectFailure(
      runScan({
        scanId: "x",
        url: "http://10.0.0.1/",
        viewports: ["desktop"],
        outputDir: path.join(tmp, "x"),
        policy: new NetworkPolicy(),
        registry,
        onStage: (s, st) => stages.push(`${s}:${st}`),
      }),
      "blocked_destination",
    );
    expect(stages).toEqual(["validating_url:running", "validating_url:failed"]);
  });

  it("rejects cloud metadata and IPv6 loopback literals", async () => {
    for (const url of [
      "http://169.254.169.254/latest/meta-data/",
      "http://[::1]/",
      "http://[::ffff:127.0.0.1]/",
    ]) {
      await expectFailure(
        runScan({
          scanId: "x",
          url,
          viewports: ["desktop"],
          outputDir: path.join(tmp, "x"),
          policy: new NetworkPolicy(),
          registry,
        }),
        "blocked_destination",
      );
    }
  });

  it("blocks a redirect from a permitted page to a private address", async () => {
    await expectFailure(
      scan(server, `${server.url}__redirect-internal`, { viewports: ["desktop"] }),
      "blocked_destination",
    );
  });

  it("blocks a redirect to the cloud metadata endpoint", async () => {
    await expectFailure(
      scan(server, `${server.url}__redirect-metadata`, { viewports: ["desktop"] }),
      "blocked_destination",
    );
  });

  it("fails on excessive redirects", async () => {
    await expectFailure(
      scan(server, `${server.url}__redirect-loop`, { viewports: ["desktop"] }),
      "navigation_failed",
    );
  });

  it("times out pages that never respond", async () => {
    await expectFailure(
      scan(server, `${server.url}__slow`, {
        viewports: ["desktop"],
        limits: { navTimeoutMs: 2500 },
      }),
      "navigation_timeout",
    );
  });

  it("enforces the per-scan transfer limit", async () => {
    await expectFailure(
      scan(server, `${server.url}__huge`, {
        viewports: ["desktop"],
        limits: { maxTotalBytes: 300_000 },
      }),
      "resource_limit",
    );
  });

  it("can be cancelled while running", async () => {
    const controller = new AbortController();
    const p = scan(server, server.url, { signal: controller.signal });
    setTimeout(() => controller.abort(), 1500);
    await expectFailure(p, "cancelled");
  });

  it("does not allow file:// URLs", async () => {
    await expectFailure(
      runScan({
        scanId: "x",
        url: "file:///C:/Windows/win.ini",
        viewports: ["desktop"],
        outputDir: path.join(tmp, "x"),
        policy: new NetworkPolicy(),
        registry,
      }),
      "invalid_url",
    );
  });
});

export type { Report };
