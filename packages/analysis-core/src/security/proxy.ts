import http from "node:http";
import net from "node:net";
import type { Duplex } from "node:stream";
import { ScanFailure } from "../errors.js";
import type { NetworkPolicy } from "./policy.js";

/** Set on synthetic responses the proxy generates, so they are never analysed as the site. */
export const BLOCKED_HEADER = "x-webdna-blocked";

export interface ProxyBudget {
  /** Total bytes received from upstream servers across all connections. */
  maxTotalBytes: number;
  /** Maximum upstream connections/requests the proxy will open. */
  maxConnections: number;
  /** Idle timeout for upstream sockets. */
  socketTimeoutMs: number;
}

export interface BlockedAttempt {
  host: string;
  port: number;
  reason: string;
}

export interface FilteringProxy {
  port: number;
  stats: { bytesIn: number; connections: number; budgetExceeded: boolean };
  blocked: BlockedAttempt[];
  close(): Promise<void>;
}

/**
 * A per-scan forward proxy that the isolated browser is forced to use for every
 * request (including loopback, via Chromium's `<-loopback>` bypass rule).
 *
 * For each CONNECT tunnel or plain-HTTP request it resolves the hostname once,
 * validates every address against the NetworkPolicy and then connects to that exact
 * address. Because the browser never resolves DNS itself, a DNS-rebinding answer that
 * changes between "check" and "connect" cannot redirect the connection.
 */
export async function startFilteringProxy(
  policy: NetworkPolicy,
  budget: ProxyBudget,
): Promise<FilteringProxy> {
  const stats = { bytesIn: 0, connections: 0, budgetExceeded: false };
  const blocked: BlockedAttempt[] = [];
  const sockets = new Set<Duplex>();

  const track = (s: Duplex) => {
    sockets.add(s);
    s.on("close", () => sockets.delete(s));
  };
  const countIn = (chunk: Buffer) => {
    stats.bytesIn += chunk.length;
    if (stats.bytesIn > budget.maxTotalBytes && !stats.budgetExceeded) {
      stats.budgetExceeded = true;
      for (const s of sockets) s.destroy();
    }
  };
  const admit = (host: string, port: number): string | undefined => {
    if (stats.budgetExceeded) return "Scan transfer budget exceeded";
    if (stats.connections >= budget.maxConnections) return "Scan connection budget exceeded";
    stats.connections += 1;
    void host;
    void port;
    return undefined;
  };
  const block = (host: string, port: number, reason: string) => {
    if (blocked.length < 200) blocked.push({ host, port, reason });
  };

  const server = http.createServer(async (req, res) => {
    // Plain HTTP request in absolute form: "GET http://host/path HTTP/1.1".
    let target: URL;
    try {
      target = new URL(req.url ?? "");
      if (target.protocol !== "http:") throw new Error("bad protocol");
    } catch {
      res.writeHead(400).end();
      return;
    }
    const port = target.port ? Number(target.port) : 80;
    const refusal = admit(target.hostname, port);
    if (refusal) {
      block(target.hostname, port, refusal);
      res.writeHead(429, { [BLOCKED_HEADER]: "1" }).end();
      return;
    }
    let destination;
    try {
      destination = await policy.validate(target.hostname, port);
    } catch (error) {
      block(
        target.hostname,
        port,
        error instanceof ScanFailure ? error.message : "validation failed",
      );
      res
        .writeHead(403, { "content-type": "text/plain", [BLOCKED_HEADER]: "1" })
        .end("Blocked by WebDNA network policy");
      return;
    }
    const headers = { ...req.headers };
    delete headers["proxy-connection"];
    delete headers["proxy-authorization"];
    const upstream = http.request(
      {
        host: destination.address,
        family: destination.family,
        port,
        method: req.method,
        path: `${target.pathname}${target.search}`,
        headers: { ...headers, host: target.host },
        setHost: false,
        timeout: budget.socketTimeoutMs,
      },
      (upRes) => {
        // Sites must not be able to impersonate a proxy block.
        delete upRes.headers[BLOCKED_HEADER];
        res.writeHead(upRes.statusCode ?? 502, upRes.headers);
        upRes.on("data", countIn);
        upRes.pipe(res);
      },
    );
    upstream.on("socket", track);
    upstream.on("timeout", () => upstream.destroy());
    upstream.on("error", () => {
      if (!res.headersSent) res.writeHead(502).end();
      else res.destroy();
    });
    req.pipe(upstream);
  });

  server.on("connect", async (req: http.IncomingMessage, client: Duplex, head: Buffer) => {
    track(client);
    client.on("error", () => client.destroy());
    const [hostPart, portPart] = splitHostPort(req.url ?? "");
    const port = Number(portPart);
    if (!hostPart || !Number.isInteger(port)) {
      client.end("HTTP/1.1 400 Bad Request\r\n\r\n");
      return;
    }
    const refusal = admit(hostPart, port);
    if (refusal) {
      block(hostPart, port, refusal);
      client.end("HTTP/1.1 429 Too Many Requests\r\n\r\n");
      return;
    }
    let destination;
    try {
      destination = await policy.validate(hostPart, port);
    } catch (error) {
      block(hostPart, port, error instanceof ScanFailure ? error.message : "validation failed");
      client.end("HTTP/1.1 403 Forbidden\r\n\r\n");
      return;
    }
    const upstream = net.connect({ host: destination.address, port, family: destination.family });
    track(upstream);
    upstream.setTimeout(budget.socketTimeoutMs, () => upstream.destroy());
    upstream.on("connect", () => {
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head.length > 0) upstream.write(head);
      upstream.on("data", countIn);
      upstream.pipe(client);
      client.pipe(upstream);
    });
    upstream.on("error", () => {
      client.end("HTTP/1.1 502 Bad Gateway\r\n\r\n");
    });
    client.on("close", () => upstream.destroy());
    upstream.on("close", () => client.destroy());
  });

  // Plain-HTTP WebSocket upgrades are not proxied.
  server.on("upgrade", (_req, socket: Duplex) => socket.destroy());

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as net.AddressInfo;

  return {
    port: address.port,
    stats,
    blocked,
    close: () =>
      new Promise<void>((resolve) => {
        for (const s of sockets) s.destroy();
        server.close(() => resolve());
        server.closeAllConnections?.();
      }),
  };
}

function splitHostPort(value: string): [string | undefined, string | undefined] {
  // "[::1]:443" or "example.com:443"
  const m = /^\[([^\]]+)\]:(\d+)$/.exec(value) ?? /^([^:]+):(\d+)$/.exec(value);
  return m ? [m[1], m[2]] : [undefined, undefined];
}
