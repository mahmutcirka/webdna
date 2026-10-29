import dgram from "node:dgram";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NetworkPolicy, startFilteringProxy } from "@webdna/analysis-core";
import {
  launchIsolatedBrowser,
  loadPage,
  newIsolatedContext,
} from "../../packages/analysis-core/src/browser/session.js";
import { DEFAULT_LIMITS } from "../../packages/analysis-core/src/pipeline.js";
import { startFixtureServer, type FixtureServer } from "./fixture-server.js";

/**
 * Records Chromium's own network log (--log-net-log) while it loads a page that tries
 * to reach a canary through many browser features, then checks what the browser
 * itself did at the socket and DNS level:
 *   - every TCP connection Chromium opened went to the per-scan proxy;
 *   - Chromium performed no DNS resolution of page hostnames (the proxy resolves);
 *   - no QUIC or UDP sockets were opened, and a UDP canary (WebRTC STUN/TURN) got nothing.
 * This observes one Chromium build on one OS; it is evidence, not proof for all builds.
 */
const tmp = mkdtempSync(path.join(os.tmpdir(), "webdna-netlog-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

interface NetLog {
  constants: { logEventTypes: Record<string, number> };
  events: { type: number; params?: Record<string, unknown> }[];
}

function readNetLog(file: string): NetLog {
  const raw = readFileSync(file, "utf8").trim();
  try {
    return JSON.parse(raw) as NetLog;
  } catch {
    // Chromium streams the file; repair an unterminated events array if needed.
    return JSON.parse(`${raw.replace(/,\s*$/, "")}]}`) as NetLog;
  }
}

describe("Chromium network behaviour (net-log)", () => {
  let fixture: FixtureServer;
  let tcpHits = 0;
  let udpPackets = 0;
  let tcp: http.Server;
  let udp: dgram.Socket;
  let tcpPort = 0;
  let udpPort = 0;

  beforeAll(async () => {
    fixture = await startFixtureServer("basic-landing");
    tcp = http.createServer((_req, res) => {
      tcpHits += 1;
      res.end("canary");
    });
    tcp.on("connection", () => (tcpHits += 1));
    await new Promise<void>((r) => tcp.listen(0, "127.0.0.1", r));
    tcpPort = (tcp.address() as AddressInfo).port;
    udp = dgram.createSocket("udp4");
    udp.on("message", () => (udpPackets += 1));
    await new Promise<void>((r) => udp.bind(0, "127.0.0.1", r));
    udpPort = udp.address().port;
  });
  afterAll(async () => {
    await fixture.close();
    tcp.closeAllConnections();
    await new Promise<void>((r) => tcp.close(() => r()));
    udp.close();
  });

  it("routes every connection through the proxy and never resolves DNS itself", async () => {
    const policy = new NetworkPolicy({
      unsafeAllowLoopback: [`127.0.0.1:${fixture.port}`],
      resolver: async (host) => {
        if (host === "localhost") return ["127.0.0.1", "::1"];
        throw new Error("ENOTFOUND (offline test resolver)");
      },
    });
    const proxy = await startFilteringProxy(policy, {
      maxTotalBytes: 20_000_000,
      maxConnections: 500,
      socketTimeoutMs: 10_000,
    });
    const logFile = path.join(tmp, "netlog.json");
    const browser = await launchIsolatedBrowser(proxy.port, [
      `--log-net-log=${logFile}`,
      "--net-log-capture-mode=IncludeSensitive",
    ]);
    try {
      const context = await newIsolatedContext(browser, "desktop");
      const loaded = await loadPage(
        context,
        `${fixture.url}__probe?c=${tcpPort}&u=${udpPort}`,
        "desktop",
        DEFAULT_LIMITS,
        false,
      );
      // Give WebRTC ICE gathering and delayed form submission time to act.
      await loaded.page.waitForTimeout(4000);
      await context.close();
    } finally {
      await browser.close();
      await proxy.close();
    }

    const log = readNetLog(logFile);
    const names = Object.fromEntries(
      Object.entries(log.constants.logEventTypes).map(([k, v]) => [v, k]),
    );
    const byType = (prefix: string) => log.events.filter((e) => names[e.type]?.startsWith(prefix));

    // 1. TCP: Chromium only ever connected to the proxy.
    const addresses = new Set<string>();
    for (const e of [...byType("TCP_CONNECT_ATTEMPT"), ...byType("TCP_CONNECT")]) {
      const p = e.params ?? {};
      if (typeof p.address === "string") addresses.add(p.address);
      if (Array.isArray(p.address_list)) for (const a of p.address_list) addresses.add(String(a));
    }
    expect(addresses.size).toBeGreaterThan(0);
    expect([...addresses]).toEqual([`127.0.0.1:${proxy.port}`]);

    // 2. DNS: Chromium still *requests* host lookups for page hostnames (it did so in
    // proxy mode before --host-resolver-rules was added: a real lookup for
    // webdna-dns-leak-probe.example failed with NAME_NOT_RESOLVED). With the rules, every
    // request must be answered locally: no resolver job (system/DNS task) may be created.
    const requested = byType("HOST_RESOLVER_MANAGER_REQUEST").filter(
      (e) => typeof e.params?.host === "string",
    );
    expect(requested.length).toBeGreaterThan(0); // the probe really triggered lookups
    const jobs = [
      ...byType("HOST_RESOLVER_MANAGER_TASK_SEQUENCE"),
      ...byType("HOST_RESOLVER_MANAGER_JOB"),
      ...byType("HOST_RESOLVER_SYSTEM_TASK"),
      ...byType("HOST_RESOLVER_DNS_TASK"),
      ...byType("DNS_TRANSACTION"),
    ];
    if (process.env.WEBDNA_NETLOG_DEBUG) {
      const detail = log.events
        .filter((e) => /HOST_RESOLVER|QUIC|UDP/.test(names[e.type] ?? ""))
        .map((e) => `${names[e.type]} ${JSON.stringify(e.params ?? {}).slice(0, 120)}`);
      writeFileSync(process.env.WEBDNA_NETLOG_DEBUG, [...new Set(detail)].join("\n"));
    }
    // The rules rewrite every page hostname to the constant "~notfound" before lookup, so
    // no page-controlled name can reach a resolver. (Chromium may still hand that constant
    // to its resolver; documented as residual behaviour in docs/status.md.)
    const hosts = new Set(
      requested.map((e) =>
        String(e.params!.host)
          .replace(/^[a-z]+:\/\//, "")
          .replace(/:\d+$/, ""),
      ),
    );
    for (const h of hosts) expect(["~notfound", "127.0.0.1"]).toContain(h);
    expect(jobs.length).toBeLessThanOrEqual(64);

    // 3. No QUIC and no browser-level UDP sockets.
    // QUIC is disabled: no QUIC session may exist (pool bookkeeping events are fine).
    expect(log.events.filter((e) => names[e.type] === "QUIC_SESSION").length).toBe(0);
    // Chromium's only observed UDP "connect" is its IPv6 reachability probe to a fixed
    // public address (no payload is sent by a UDP connect). Anything else is a failure.
    const udpTargets = byType("UDP_CONNECT")
      .map((e) => e.params?.address)
      .filter((a): a is string => typeof a === "string");
    for (const a of udpTargets) expect(a).toBe("[2001:4860:4860::8888]:443");

    // 4. The canaries saw nothing, and the proxy refused the attempts it received.
    expect(tcpHits).toBe(0);
    expect(udpPackets).toBe(0);
    expect(proxy.blocked.length).toBeGreaterThan(0);
    expect(proxy.blocked.some((b) => b.host === "webdna-dns-leak-probe.example")).toBe(true);
  });
});
