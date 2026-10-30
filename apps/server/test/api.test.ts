import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ReportSchema, type Report } from "@webdna/shared";
import { ScanFailure } from "@webdna/analysis-core";
import { buildApp, type WebDnaApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import type { ScanRunner } from "../src/queue.js";

// The API tests use a stub runner; the real browser pipeline is covered by tests/integration.
const sample = ReportSchema.parse(
  JSON.parse(
    readFileSync(
      path.resolve(import.meta.dirname, "../../web/src/sample/sample-report.json"),
      "utf8",
    ),
  ),
) as Report;

let dir: string;
let ctx: WebDnaApp;

async function setup(runner: ScanRunner, overrides: Record<string, string> = {}) {
  dir = mkdtempSync(path.join(os.tmpdir(), "webdna-api-"));
  ctx = await buildApp({
    config: loadConfig({ WEBDNA_DATA_DIR: dir, WEBDNA_MAX_CONCURRENCY: "1", ...overrides }),
    runner,
  });
}

const okRunner: ScanRunner = async (record, _signal, onStage) => {
  onStage("validating_url", "running");
  onStage("validating_url", "done", "ok");
  return { ...sample, scanId: record.id };
};

beforeEach(() => undefined);
afterEach(async () => {
  await ctx?.app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("scan lifecycle API", () => {
  it("rejects malformed and prohibited URLs with structured errors", async () => {
    await setup(okRunner);
    for (const [url, code] of [
      ["ftp://x.com", "invalid_url"],
      ["http://localhost:8080", "blocked_destination"],
      ["not a url", "invalid_url"],
    ]) {
      const res = await ctx.app.inject({ method: "POST", url: "/api/scans", payload: { url } });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe(code);
    }
    const bad = await ctx.app.inject({ method: "POST", url: "/api/scans", payload: { nope: 1 } });
    expect(bad.json().error.code).toBe("invalid_request");
  });

  it("creates, runs, lists, reports, exports and deletes a scan", async () => {
    await setup(okRunner);
    const created = await ctx.app.inject({
      method: "POST",
      url: "/api/scans",
      payload: { url: "example.com" },
    });
    expect(created.statusCode).toBe(202);
    const id = created.json().scan.id as string;
    await ctx.queue.drain();

    const status = (await ctx.app.inject({ url: `/api/scans/${id}` })).json().scan;
    expect(status.status).toBe("completed");
    expect(status.stages.find((s: { id: string }) => s.id === "validating_url").state).toBe("done");
    expect(status.summary.aiConclusion).toBe(sample.aiOrigin.conclusion);

    const list = (await ctx.app.inject({ url: "/api/scans" })).json().scans;
    expect(list.map((s: { id: string }) => s.id)).toContain(id);

    const report = (await ctx.app.inject({ url: `/api/scans/${id}/report` })).json().report;
    expect(report.scanId).toBe(id);

    for (const [format, type] of [
      ["json", "application/json"],
      ["css", "text/css"],
      ["tailwind", "text/css"],
      ["markdown", "text/markdown"],
      ["prompt", "text/markdown"],
      ["evidence", "application/zip"],
    ]) {
      const res = await ctx.app.inject({ url: `/api/scans/${id}/export/${format}` });
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toContain(type);
      expect(res.headers["content-disposition"]).toMatch(/^attachment; filename="webdna-/);
    }
    const prompt = await ctx.app.inject({
      url: `/api/scans/${id}/export/prompt?stack=html&lang=tr`,
    });
    expect(prompt.headers["content-disposition"]).toMatch(/\.prompt\.md"$/);
    expect(prompt.body).toContain("Özgünlük kuralları");
    expect(prompt.body).toContain(":root {");
    const badStack = await ctx.app.inject({ url: `/api/scans/${id}/export/prompt?stack=php` });
    expect(badStack.statusCode).toBe(400);
    const cmp = await ctx.app.inject({ url: `/api/compare?a=${id}&b=${id}` });
    expect(cmp.json().comparison.sameTarget).toBe(true);

    expect((await ctx.app.inject({ method: "DELETE", url: `/api/scans/${id}` })).statusCode).toBe(
      204,
    );
    expect((await ctx.app.inject({ url: `/api/scans/${id}` })).statusCode).toBe(404);
  });

  it("records failures with their error code and skips remaining stages", async () => {
    await setup(async () => {
      throw new ScanFailure("blocked_destination", "resolves to a private address");
    });
    const id = (
      await ctx.app.inject({
        method: "POST",
        url: "/api/scans",
        payload: { url: "https://example.com" },
      })
    ).json().scan.id;
    await ctx.queue.drain();
    const scan = (await ctx.app.inject({ url: `/api/scans/${id}` })).json().scan;
    expect(scan.status).toBe("failed");
    expect(scan.error.code).toBe("blocked_destination");
    expect(scan.stages.every((s: { state: string }) => s.state === "skipped")).toBe(true);
    expect((await ctx.app.inject({ url: `/api/scans/${id}/report` })).statusCode).toBe(409);
  });

  it("cancels running and queued scans", async () => {
    const slow: ScanRunner = (_r, signal) =>
      new Promise((_, reject) =>
        signal.addEventListener("abort", () =>
          reject(new ScanFailure("cancelled", "Scan was cancelled.")),
        ),
      );
    await setup(slow);
    const a = (
      await ctx.app.inject({
        method: "POST",
        url: "/api/scans",
        payload: { url: "https://a.example" },
      })
    ).json().scan.id;
    const b = (
      await ctx.app.inject({
        method: "POST",
        url: "/api/scans",
        payload: { url: "https://b.example" },
      })
    ).json().scan.id;
    expect((await ctx.app.inject({ method: "DELETE", url: `/api/scans/${a}` })).statusCode).toBe(
      409,
    );
    expect(
      (await ctx.app.inject({ method: "POST", url: `/api/scans/${b}/cancel` })).statusCode,
    ).toBe(202);
    expect(
      (await ctx.app.inject({ method: "POST", url: `/api/scans/${a}/cancel` })).statusCode,
    ).toBe(202);
    await ctx.queue.drain();
    for (const id of [a, b])
      expect((await ctx.app.inject({ url: `/api/scans/${id}` })).json().scan.status).toBe(
        "cancelled",
      );
    expect(
      (await ctx.app.inject({ method: "POST", url: `/api/scans/${a}/cancel` })).statusCode,
    ).toBe(409);
  });

  it("bounds the queue", async () => {
    const never: ScanRunner = (_r, signal) =>
      new Promise((_, rej) =>
        signal.addEventListener("abort", () => rej(new ScanFailure("cancelled", "x"))),
      );
    await setup(never, { WEBDNA_MAX_QUEUE: "1" });
    const post = () =>
      ctx.app.inject({ method: "POST", url: "/api/scans", payload: { url: "https://q.example" } });
    expect((await post()).statusCode).toBe(202); // running
    expect((await post()).statusCode).toBe(202); // waiting
    expect((await post()).statusCode).toBe(429);
  });

  it("rejects path traversal in ids and screenshot names", async () => {
    await setup(okRunner);
    expect((await ctx.app.inject({ url: "/api/scans/..%2F..%2Fetc" })).statusCode).toBe(404);
    expect(
      (
        await ctx.app.inject({
          url: "/api/scans/00000000-0000-0000-0000-000000000000/screenshots/..%2Fscan.json",
        })
      ).statusCode,
    ).toBe(400);
  });

  it("lists detectors with versions and limitations", async () => {
    await setup(okRunner, { WEBDNA_DISABLED_DETECTORS: "template.placeholder-links" });
    const body = (await ctx.app.inject({ url: "/api/detectors" })).json();
    expect(body.ruleSetVersion).toMatch(/^engine@/);
    expect(
      body.detectors.find((d: { id: string }) => d.id === "template.placeholder-links").status,
    ).toBe("disabled");
  });

  it("marks scans interrupted by a restart as failed", async () => {
    await setup(okRunner);
    const rec = await ctx.store.create(
      "https://x.example",
      ["desktop"],
      "https://x.example/",
      "x.example",
    );
    await ctx.store.update(rec.id, (r) => {
      r.status = "running";
    });
    expect(await ctx.store.markInterrupted()).toBe(1);
    expect((await ctx.store.get(rec.id))!.error!.code).toBe("interrupted");
  });
});

describe("DNS-rebinding protection", () => {
  it("rejects requests whose Host or X-Forwarded-Host is not an allowed name", async () => {
    await setup(okRunner);
    const ok = await ctx.app.inject({ url: "/api/health", headers: { host: "127.0.0.1:4100" } });
    expect(ok.statusCode).toBe(200);
    const okLocal = await ctx.app.inject({
      url: "/api/health",
      headers: { host: "localhost:4100", "x-forwarded-host": "localhost:3000" },
    });
    expect(okLocal.statusCode).toBe(200);
    const okV6 = await ctx.app.inject({ url: "/api/health", headers: { host: "[::1]:4100" } });
    expect(okV6.statusCode).toBe(200);
    const rebound = await ctx.app.inject({
      url: "/api/scans",
      headers: { host: "attacker.example:4100" },
    });
    expect(rebound.statusCode).toBe(403);
    expect(rebound.json().error.code).toBe("host_not_allowed");
    const viaNext = await ctx.app.inject({
      method: "POST",
      url: "/api/scans",
      headers: { host: "127.0.0.1:4100", "x-forwarded-host": "attacker.example:3000" },
      payload: { url: "https://example.com" },
    });
    expect(viaNext.statusCode).toBe(403);
  });
});

describe("credential-like parameters in submitted URLs", () => {
  it("are redacted in stored records but the worker receives the real URL", async () => {
    const seen: string[] = [];
    await setup(async (record, _signal, _onStage, url) => {
      seen.push(url);
      return { ...sample, scanId: record.id };
    });
    const secret = "WdnaFakeSecret9f3k2";
    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/scans",
      payload: { url: `https://example.com/?sig=${secret}&q=1` },
    });
    expect(res.statusCode).toBe(202);
    expect(res.body).not.toContain(secret);
    await ctx.queue.drain();
    expect(seen[0]).toContain(secret);
    const list = await ctx.app.inject({ url: "/api/scans" });
    expect(list.body).not.toContain(secret);
    expect(list.body).toContain("sig=[redacted]");
  });
});
