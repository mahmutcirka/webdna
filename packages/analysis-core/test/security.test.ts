import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  NetworkPolicy,
  ScanFailure,
  classifyIp,
  normalizeTargetUrl,
  safeFetch,
  startFilteringProxy,
} from "../src/index.js";

const PUBLIC_V4 = "93.184.215.14";
const PUBLIC_V6 = "2606:2800:21f:cb07:6820:80da:af6b:8b2c";

describe("classifyIp", () => {
  it.each([PUBLIC_V4, "8.8.8.8", "1.1.1.1", PUBLIC_V6, "2001:4860:4860::8888"])(
    "allows public address %s",
    (ip) => expect(classifyIp(ip).allowed).toBe(true),
  );

  it.each([
    ["127.0.0.1", "loopback"],
    ["127.255.0.9", "loopback"],
    ["10.1.2.3", "private"],
    ["172.16.0.1", "private"],
    ["192.168.1.1", "private"],
    ["169.254.169.254", "linkLocal"],
    ["100.100.100.200", "carrierGradeNat"],
    ["0.0.0.0", "unspecified"],
    ["224.0.0.1", "multicast"],
    ["255.255.255.255", "broadcast"],
    ["198.18.0.1", "reserved"],
    ["192.0.2.10", "reserved"],
    ["240.0.0.1", "reserved"],
    ["::1", "loopback"],
    ["::", "unspecified"],
    ["fe80::1", "linkLocal"],
    ["fc00::1", "uniqueLocal"],
    ["fd00:ec2::254", "uniqueLocal"],
    ["ff02::1", "multicast"],
    ["::ffff:127.0.0.1", "loopback"],
    ["::ffff:169.254.169.254", "linkLocal"],
    ["64:ff9b::a00:1", "rfc6052"],
    ["2002:a00:1::", "6to4"],
    ["2001:0:4136:e378:8000:63bf:3fff:fdd2", "teredo"],
    ["2001:db8::1", "reserved"],
  ])("blocks %s (%s)", (ip) => expect(classifyIp(ip).allowed).toBe(false));

  it("rejects invalid input", () => expect(classifyIp("not-an-ip").allowed).toBe(false));
});

describe("normalizeTargetUrl", () => {
  it("adds https and strips fragments", () => {
    expect(normalizeTargetUrl("example.com/path#frag").toString()).toBe("https://example.com/path");
  });
  it("normalises alternative IPv4 notations so they can be checked", () => {
    expect(normalizeTargetUrl("http://0x7f.0.0.1/").hostname).toBe("127.0.0.1");
    expect(normalizeTargetUrl("http://2130706433/").hostname).toBe("127.0.0.1");
  });
  it.each([
    ["ftp://example.com", "invalid_url"],
    ["file:///etc/passwd", "invalid_url"],
    ["javascript:alert(1)", "invalid_url"],
    ["http://user:pass@example.com", "invalid_url"],
    ["http://localhost:3000", "blocked_destination"],
    ["http://app.localhost", "blocked_destination"],
    ["http://printer.local", "blocked_destination"],
    ["http://metadata.google.internal/", "blocked_destination"],
    ["http://intranet/", "invalid_url"],
    ["", "invalid_url"],
    ["http://exa mple.com", "invalid_url"],
    [`https://example.com/${"a".repeat(2100)}`, "invalid_url"],
  ])("rejects %s", (input, code) => {
    try {
      normalizeTargetUrl(input);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ScanFailure);
      expect((e as ScanFailure).code).toBe(code);
    }
  });
});

describe("NetworkPolicy", () => {
  const resolverFor =
    (map: Record<string, string[] | (() => string[])>) => async (host: string) => {
      const v = map[host];
      if (!v) throw new Error("ENOTFOUND");
      return typeof v === "function" ? v() : v;
    };

  it("accepts a host that resolves only to public addresses", async () => {
    const p = new NetworkPolicy({ resolver: resolverFor({ "ok.test": [PUBLIC_V4, PUBLIC_V6] }) });
    await expect(p.validate("ok.test", 443)).resolves.toMatchObject({ address: PUBLIC_V4 });
  });

  it("rejects a host with any private record (mixed answers)", async () => {
    const p = new NetworkPolicy({
      resolver: resolverFor({ "mixed.test": [PUBLIC_V4, "10.0.0.5"] }),
    });
    await expect(p.validate("mixed.test", 443)).rejects.toMatchObject({
      code: "blocked_destination",
    });
  });

  it("rejects IPv6 literals in private ranges", async () => {
    const p = new NetworkPolicy();
    await expect(p.validate("[::1]", 80)).rejects.toMatchObject({ code: "blocked_destination" });
    await expect(p.validate("[fd00:ec2::254]", 80)).rejects.toMatchObject({
      code: "blocked_destination",
    });
  });

  it("rejects disallowed ports", async () => {
    const p = new NetworkPolicy({ resolver: resolverFor({ "ok.test": [PUBLIC_V4] }) });
    await expect(p.validate("ok.test", 22)).rejects.toMatchObject({ code: "blocked_destination" });
  });

  it("reports DNS failures distinctly", async () => {
    const p = new NetworkPolicy({ resolver: resolverFor({}) });
    await expect(p.validate("missing.test", 443)).rejects.toMatchObject({ code: "dns_failure" });
  });

  it("re-validates on every call, so a rebinding answer is caught", async () => {
    let calls = 0;
    const p = new NetworkPolicy({
      resolver: resolverFor({ "rebind.test": () => (calls++ === 0 ? [PUBLIC_V4] : ["127.0.0.1"]) }),
    });
    await expect(p.validate("rebind.test", 443)).resolves.toMatchObject({ address: PUBLIC_V4 });
    await expect(p.validate("rebind.test", 443)).rejects.toMatchObject({
      code: "blocked_destination",
    });
  });

  it("only allows loopback for exact allow-listed host:port pairs", async () => {
    const p = new NetworkPolicy({ unsafeAllowLoopback: ["127.0.0.1:4555"] });
    await expect(p.validate("127.0.0.1", 4555)).resolves.toBeTruthy();
    await expect(p.validate("127.0.0.1", 4556)).rejects.toMatchObject({
      code: "blocked_destination",
    });
  });
});

describe("safeFetch and filtering proxy against a local server", () => {
  let server: http.Server;
  let port = 0;
  let hits = 0;
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      hits += 1;
      if (req.url === "/redirect-metadata") {
        res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" }).end();
        return;
      }
      if (req.url === "/redirect-private") {
        res.writeHead(302, { location: "http://10.0.0.1/" }).end();
        return;
      }
      if (req.url === "/big") {
        res.writeHead(200);
        res.end(Buffer.alloc(200_000, 97));
        return;
      }
      res.writeHead(200, { "content-type": "text/plain" }).end("ok");
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it("pins the connection to the address the policy resolved", async () => {
    // "fixture.test" does not exist in real DNS; the request only succeeds because the
    // socket connects to the validated address instead of re-resolving the name.
    const p = new NetworkPolicy({
      unsafeAllowLoopback: [`fixture.test:${port}`],
      resolver: async () => ["127.0.0.1"],
    });
    const r = await safeFetch(`http://fixture.test:${port}/`, p, {
      maxBytes: 1000,
      timeoutMs: 5000,
    });
    expect(r.status).toBe(200);
    expect(r.body.toString()).toBe("ok");
  });

  it("blocks redirects to cloud metadata and private addresses", async () => {
    const p = new NetworkPolicy({ unsafeAllowLoopback: [`127.0.0.1:${port}`] });
    await expect(
      safeFetch(`http://127.0.0.1:${port}/redirect-metadata`, p, {
        maxBytes: 1000,
        timeoutMs: 5000,
      }),
    ).rejects.toMatchObject({ code: "blocked_destination" });
    await expect(
      safeFetch(`http://127.0.0.1:${port}/redirect-private`, p, {
        maxBytes: 1000,
        timeoutMs: 5000,
      }),
    ).rejects.toMatchObject({ code: "blocked_destination" });
  });

  it("truncates oversized responses at the byte limit", async () => {
    const p = new NetworkPolicy({ unsafeAllowLoopback: [`127.0.0.1:${port}`] });
    const r = await safeFetch(`http://127.0.0.1:${port}/big`, p, {
      maxBytes: 10_000,
      timeoutMs: 5000,
    });
    expect(r.truncated).toBe(true);
    expect(r.body.length).toBe(10_000);
  });

  it("refuses non-allow-listed loopback through the proxy", async () => {
    const proxy = await startFilteringProxy(new NetworkPolicy(), {
      maxTotalBytes: 1e6,
      maxConnections: 10,
      socketTimeoutMs: 5000,
    });
    try {
      const status = await new Promise<number>((resolve, reject) => {
        const req = http.request(
          { host: "127.0.0.1", port: proxy.port, method: "GET", path: `http://127.0.0.1:${port}/` },
          (res) => {
            res.resume();
            resolve(res.statusCode ?? 0);
          },
        );
        req.on("error", reject);
        req.end();
      });
      expect(status).toBe(403);
      expect(proxy.blocked[0]!.reason).toMatch(/not allowed|non-public/);
    } finally {
      await proxy.close();
    }
  });

  it("refuses CONNECT tunnels to private destinations", async () => {
    const proxy = await startFilteringProxy(
      new NetworkPolicy({ resolver: async () => ["10.0.0.7"] }),
      { maxTotalBytes: 1e6, maxConnections: 10, socketTimeoutMs: 5000 },
    );
    try {
      const status = await new Promise<number>((resolve, reject) => {
        const req = http.request({
          host: "127.0.0.1",
          port: proxy.port,
          method: "CONNECT",
          path: "internal.example:443",
        });
        req.on("connect", (res, socket) => {
          socket.destroy();
          resolve(res.statusCode ?? 0);
        });
        req.on("error", reject);
        req.end();
      });
      expect(status).toBe(403);
    } finally {
      await proxy.close();
    }
  });

  it("enforces the connection budget", async () => {
    const policy = new NetworkPolicy({ unsafeAllowLoopback: [`127.0.0.1:${port}`] });
    const proxy = await startFilteringProxy(policy, {
      maxTotalBytes: 1e6,
      maxConnections: 1,
      socketTimeoutMs: 5000,
    });
    const get = () =>
      new Promise<number>((resolve, reject) => {
        const req = http.request(
          { host: "127.0.0.1", port: proxy.port, path: `http://127.0.0.1:${port}/`, agent: false },
          (res) => {
            res.resume();
            resolve(res.statusCode ?? 0);
          },
        );
        req.on("error", reject);
        req.end();
      });
    try {
      expect(await get()).toBe(200);
      expect(await get()).toBe(429);
    } finally {
      await proxy.close();
    }
    expect(hits).toBeGreaterThan(0);
  });
});
