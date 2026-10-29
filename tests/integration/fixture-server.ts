import { createReadStream, existsSync, statSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};

export interface FixtureServer {
  url: string;
  port: number;
  close(): Promise<void>;
}

/**
 * Serves one fixture site from fixtures/sites/<name> on 127.0.0.1 with a few special
 * routes used by the security tests. Only used in tests; never exposed.
 */
export async function startFixtureServer(name: string, listenPort = 0): Promise<FixtureServer> {
  const root = path.join(REPO_ROOT, "fixtures", "sites", name);
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://fixture");
    if (url.pathname === "/__redirect-internal") {
      res.writeHead(302, { location: "http://10.0.0.1/" }).end();
      return;
    }
    if (url.pathname === "/__redirect-metadata") {
      res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" }).end();
      return;
    }
    if (url.pathname === "/__redirect-loop") {
      const n = Number(url.searchParams.get("n") ?? "0");
      res.writeHead(302, { location: `/__redirect-loop?n=${n + 1}` }).end();
      return;
    }
    if (url.pathname === "/__redirect-to") {
      // Redirect to a caller-supplied loopback URL (SSRF tests only; the server is test-only).
      res.writeHead(302, { location: url.searchParams.get("u") ?? "/" }).end();
      return;
    }
    if (url.pathname === "/__probe") {
      // A page that tries to reach a non-allow-listed "internal" canary server through many
      // browser features. The canary must receive zero requests.
      const c = Number(url.searchParams.get("c"));
      const u = Number(url.searchParams.get("u") ?? c);
      const targets = [
        `http://127.0.0.1:${c}/img`,
        `http://localhost:${c}/localhost-name`,
        `http://localhost.:${c}/trailing-dot`,
        `http://127.1:${c}/short-form`,
        `http://2130706433:${c}/decimal`,
        `http://0x7f000001:${c}/hex`,
        `http://0177.0.0.1:${c}/octal`,
        `http://[::1]:${c}/ipv6-loopback`,
        `http://[::ffff:127.0.0.1]:${c}/ipv4-mapped`,
        `http://0.0.0.0:${c}/unspecified`,
        // Never resolvable: if Chromium resolved names itself, this lookup would appear in its net-log.
        `http://webdna-dns-leak-probe.example:${c}/dns-leak`,
      ];
      const html = `<!doctype html><html><head><title>probe</title>
<link rel="stylesheet" href="http://127.0.0.1:${c}/css-link">
<link rel="preconnect" href="http://127.0.0.1:${c}">
<link rel="prefetch" href="http://127.0.0.1:${c}/prefetch">
<style>@import url("http://127.0.0.1:${c}/css-import"); body{background:url("http://127.0.0.1:${c}/css-bg")}</style>
</head><body><h1>SSRF probe fixture</h1><p>Synthetic page used by WebDNA's security tests.</p>
${targets.map((t) => `<img src="${t}" alt="">`).join("\n")}
<iframe src="http://127.0.0.1:${c}/iframe"></iframe>
<script src="http://127.0.0.1:${c}/script.js"></script>
<form id="f" action="http://127.0.0.1:${c}/form" method="post"><input name="a" value="1"></form>
<script>
for (const u of ${JSON.stringify(targets)}) { fetch(u, { mode: "no-cors" }).catch(() => {}); }
try { const x = new XMLHttpRequest(); x.open("GET", "http://127.0.0.1:${c}/xhr"); x.send(); } catch (e) {}
try { new WebSocket("ws://127.0.0.1:${c}/ws"); } catch (e) {}
try { new EventSource("http://127.0.0.1:${c}/sse"); } catch (e) {}
try { navigator.sendBeacon("http://127.0.0.1:${c}/beacon", "x"); } catch (e) {}
try { window.open("http://127.0.0.1:${c}/popup"); } catch (e) {}
try { navigator.serviceWorker && navigator.serviceWorker.register("/sw.js").catch(() => {}); } catch (e) {}
try { const pc = new RTCPeerConnection({ iceServers: [{ urls: ["stun:127.0.0.1:${u}", "turn:127.0.0.1:${u}?transport=udp"], username: "x", credential: "x" }] }); pc.createDataChannel("x"); pc.createOffer().then(o => pc.setLocalDescription(o)); } catch (e) {}
setTimeout(() => { try { document.getElementById("f").submit(); } catch (e) {} }, 300);
</script></body></html>`;
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(html);
      return;
    }
    if (url.pathname === "/__slow") {
      // Never responds; used for navigation timeout tests.
      return;
    }
    if (url.pathname === "/__huge") {
      res.writeHead(200, { "content-type": "text/html" });
      res.write("<!doctype html><html><body>");
      const chunk = `<p>${"x".repeat(1000)}</p>`;
      for (let i = 0; i < 4000; i += 1) res.write(chunk);
      res.end("</body></html>");
      return;
    }
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    let file = path.join(root, rel);
    if (!file.startsWith(root)) {
      res.writeHead(403).end();
      return;
    }
    if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, "index.html");
    if (!existsSync(file)) {
      res.writeHead(404, { "content-type": "text/plain" }).end("not found");
      return;
    }
    res.writeHead(200, {
      "content-type": TYPES[path.extname(file)] ?? "application/octet-stream",
      "x-fixture": name,
    });
    createReadStream(file).pipe(res);
  });
  await new Promise<void>((resolve) => server.listen(listenPort, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}/`,
    port,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
