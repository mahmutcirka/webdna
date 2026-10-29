import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDefaultRegistry } from "@webdna/detectors";
import {
  NetworkPolicy,
  ScanFailure,
  exportCssVariables,
  exportJson,
  exportMarkdown,
  exportTailwindTheme,
  runScan,
} from "@webdna/analysis-core";
import { startFixtureServer, type FixtureServer } from "./fixture-server.js";

/** Synthetic marker value; it must never appear in stored output. */
const SECRET = "WdnaFakeSecret9f3k2";
const registry = createDefaultRegistry();
const tmp = mkdtempSync(path.join(os.tmpdir(), "webdna-redact-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe("credential-like URL parameters in user-supplied URLs", () => {
  let server: FixtureServer;
  beforeAll(async () => {
    server = await startFixtureServer("basic-landing");
  });
  afterAll(() => server.close());
  const policy = () =>
    new NetworkPolicy({
      unsafeAllowLoopback: [`127.0.0.1:${server.port}`],
      resolver: async () => {
        throw new Error("offline");
      },
    });

  it("are redacted from the report and every export", async () => {
    const report = await runScan({
      scanId: "redact-ok",
      url: `${server.url}?access_token=${SECRET}&page=2`,
      viewports: ["desktop"],
      outputDir: path.join(tmp, "ok"),
      policy: policy(),
      registry,
    });
    for (const out of [
      exportJson(report),
      exportMarkdown(report),
      exportCssVariables(report),
      exportTailwindTheme(report),
    ]) {
      expect(out).not.toContain(SECRET);
    }
    expect(report.target.inputUrl).toContain("access_token=[redacted]");
    expect(report.target.inputUrl).toContain("page=2");
  });

  it("are redacted from navigation error messages", async () => {
    try {
      await runScan({
        scanId: "redact-err",
        // TLS to a plain-HTTP fixture: Chromium fails with "net::ERR_… at https://…?token=…".
        url: `${server.url.replace("http:", "https:")}?token=${SECRET}`,
        viewports: ["desktop"],
        outputDir: path.join(tmp, "err"),
        policy: policy(),
        registry,
      });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ScanFailure);
      expect((e as ScanFailure).code).toBe("navigation_failed");
      expect((e as Error).message).not.toContain(SECRET);
      // Proves the URL was embedded in the browser error and then redacted.
      expect((e as Error).message).toContain("token=[redacted]");
    }
  });
});
