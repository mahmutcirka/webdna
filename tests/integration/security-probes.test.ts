import http from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDefaultRegistry } from "@webdna/detectors";
import { NetworkPolicy, ScanFailure, runScan } from "@webdna/analysis-core";
import { startFixtureServer, type FixtureServer } from "./fixture-server.js";

/**
 * These tests exercise SSRF vectors and hostile pages against local servers only.
 * A passing run shows the tested vectors were blocked in this environment; it does
 * not prove the absence of other bypasses.
 */
const registry = createDefaultRegistry();
const tmp = mkdtempSync(path.join(os.tmpdir(), "webdna-sec-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

interface Canary {
  port: number;
  hits: string[];
  close(): Promise<void>;
}

/** A local "internal service" that the scan must never reach. */
async function startCanary(host: string): Promise<Canary> {
  const hits: string[] = [];
  const server = http.createServer((req, res) => {
    hits.push(`${req.method} ${req.url}`);
    res.writeHead(200, { "content-type": "text/plain" }).end("internal secret");
  });
  server.on("upgrade", (req, socket) => {
    hits.push(`UPGRADE ${req.url}`);
    socket.destroy();
  });
  server.on("connect", (req, socket) => {
    hits.push(`CONNECT ${req.url}`);
    socket.destroy();
  });
  await new Promise<void>((r) => server.listen(0, host, r));
  return {
    port: (server.address() as AddressInfo).port,
    hits,
    close: () =>
      new Promise<void>((r) => {
        server.closeAllConnections();
        server.close(() => r());
      }),
  };
}

function offlinePolicy(server: FixtureServer) {
  return new NetworkPolicy({
    unsafeAllowLoopback: [`127.0.0.1:${server.port}`],
    // Real-looking resolution for "localhost" so name-based vectors are exercised.
    resolver: async (host) => {
      if (host === "localhost") return ["127.0.0.1", "::1"];
      throw new Error("ENOTFOUND (offline test resolver)");
    },
  });
}

async function scanSafely(
  server: FixtureServer,
  url: string,
  extra: Partial<Parameters<typeof runScan>[0]> = {},
) {
  const id = `sec-${Math.random().toString(36).slice(2, 8)}`;
  try {
    return {
      report: await runScan({
        scanId: id,
        url,
        viewports: ["desktop"],
        outputDir: path.join(tmp, id),
        policy: offlinePolicy(server),
        registry,
        ...extra,
      }),
    };
  } catch (error) {
    return { error: error as ScanFailure };
  }
}

describe("SSRF probes against a local canary service", () => {
  let server: FixtureServer;
  let canary4: Canary;
  let canary6: Canary | undefined;
  beforeAll(async () => {
    server = await startFixtureServer("basic-landing");
    canary4 = await startCanary("127.0.0.1");
    try {
      canary6 = await startCanary("::1");
    } catch {
      canary6 = undefined; // IPv6 loopback unavailable on this host
    }
  });
  afterAll(async () => {
    await server.close();
    await canary4.close();
    await canary6?.close();
  });

  it("a page using ~25 browser features cannot reach a non-allow-listed loopback port", async () => {
    const { report, error } = await scanSafely(server, `${server.url}__probe?c=${canary4.port}`);
    expect(canary4.hits).toEqual([]);
    // The scan itself should still complete and record blocked connections.
    expect(error).toBeUndefined();
    expect(report!.warnings.some((w) => w.code === "requests_blocked")).toBe(true);
  });

  it("the same probe cannot reach an IPv6 loopback service", async () => {
    if (!canary6) return;
    await scanSafely(server, `${server.url}__probe?c=${canary6.port}`);
    expect(canary6.hits).toEqual([]);
  });

  it.each([
    ["127.0.0.1", "IPv4 loopback"],
    ["localhost", "localhost name"],
    ["[::1]", "IPv6 loopback"],
    ["[::ffff:7f00:1]", "IPv4-mapped IPv6 (hex)"],
    ["0x7f.1", "hex short form"],
  ])("a redirect from the allowed page to %s (%s) is blocked", async (host) => {
    const target = `http://${host}:${canary4.port}/redirected`;
    const { error } = await scanSafely(
      server,
      `${server.url}__redirect-to?u=${encodeURIComponent(target)}`,
    );
    expect(canary4.hits).toEqual([]);
    expect(error?.code).toBe("blocked_destination");
  });
});

describe("hostile page runtime", () => {
  let server: FixtureServer;
  beforeAll(async () => {
    server = await startFixtureServer("hostile-runtime");
  });
  afterAll(() => server.close());

  it("cannot forge computed styles, stall readiness, or inflate the report", async () => {
    const started = Date.now();
    const { report, error } = await scanSafely(server, server.url, {
      limits: { scanTimeoutMs: 90_000 },
    });
    expect(error).toBeUndefined();
    expect(Date.now() - started).toBeLessThan(60_000);
    const hexes = report!.design.colors.map((c) => c.hex);
    expect(hexes).toContain("#123456");
    expect(hexes).toContain("#654321");
    expect(hexes).not.toContain("#010203");
    expect(JSON.stringify(report).length).toBeLessThan(2_000_000);
  });
});
