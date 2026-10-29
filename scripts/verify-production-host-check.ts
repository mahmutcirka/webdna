/**
 * Verifies the DNS-rebinding Host check against the PRODUCTION build (`next start` +
 * bundled API), which the Playwright suite (next dev) does not cover.
 *
 *   npm run build && npx tsx scripts/verify-production-host-check.ts
 *
 * Starts the bundled API on 127.0.0.1:4100 (the default the web build proxies to) with a
 * temporary data dir, and `next start` on 3413; sends requests with allowed and
 * attacker-controlled Host headers; then stops both. Exits non-zero on failure.
 */
import { spawn, type ChildProcess } from "node:child_process";
import http from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { REPO_ROOT } from "../tests/integration/fixture-server.js";

const WEB_PORT = 3413;
const API_PORT = 4100;
const data = mkdtempSync(path.join(os.tmpdir(), "webdna-prodcheck-"));
const children: ChildProcess[] = [];

function start(cmd: string, args: string[], cwd: string, env: Record<string, string>): void {
  const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: "ignore" });
  children.push(child);
}

function request(port: number, reqPath: string, host: string, extra: Record<string, string> = {}) {
  return new Promise<number>((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port, path: reqPath, headers: { host, ...extra } },
      (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      },
    );
    req.on("error", reject);
    req.end();
  });
}

async function waitFor(port: number, p: string, host: string): Promise<void> {
  for (let i = 0; i < 120; i += 1) {
    try {
      if ((await request(port, p, host)) > 0) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`port ${port} did not come up`);
}

let failures = 0;
const check = (label: string, actual: number, expected: number) => {
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}: HTTP ${actual} (expected ${expected})`);
};

try {
  start(process.execPath, ["dist/index.js"], path.join(REPO_ROOT, "apps/server"), {
    WEBDNA_PORT: String(API_PORT),
    WEBDNA_DATA_DIR: data,
    WEBDNA_OFFLINE_DNS: "1",
  });
  const nextBin = path.join(REPO_ROOT, "node_modules", "next", "dist", "bin", "next");
  start(
    process.execPath,
    [nextBin, "start", "-p", String(WEB_PORT)],
    path.join(REPO_ROOT, "apps/web"),
    {
      NEXT_TELEMETRY_DISABLED: "1",
    },
  );
  await waitFor(API_PORT, "/api/health", "127.0.0.1");
  await waitFor(WEB_PORT, "/", "127.0.0.1");

  check(
    "API direct, Host 127.0.0.1",
    await request(API_PORT, "/api/scans", `127.0.0.1:${API_PORT}`),
    200,
  );
  check(
    "API direct, Host attacker.example",
    await request(API_PORT, "/api/scans", `attacker.example:${API_PORT}`),
    403,
  );
  check(
    "next start /api proxy, Host localhost",
    await request(WEB_PORT, "/api/scans", `localhost:${WEB_PORT}`),
    200,
  );
  check(
    "next start /api proxy, Host 127.0.0.1",
    await request(WEB_PORT, "/api/scans", `127.0.0.1:${WEB_PORT}`),
    200,
  );
  check(
    "next start /api proxy, Host attacker.example",
    await request(WEB_PORT, "/api/scans", `attacker.example:${WEB_PORT}`),
    403,
  );
  // next start overwrites a client-supplied X-Forwarded-Host with the real Host, so the
  // API sees 127.0.0.1 here (observed). The rebinding case is the attacker Host above.
  check(
    "next start /api proxy, client X-Forwarded-Host replaced by real Host",
    await request(WEB_PORT, "/api/scans", `127.0.0.1:${WEB_PORT}`, {
      "x-forwarded-host": "attacker.example",
    }),
    200,
  );
  check(
    "next start /api proxy, attacker Host with X-Forwarded-Host localhost",
    await request(WEB_PORT, "/api/scans", `attacker.example:${WEB_PORT}`, {
      "x-forwarded-host": "localhost",
    }),
    403,
  );
} finally {
  for (const c of children) {
    if (process.platform === "win32" && c.pid)
      spawn("taskkill", ["/pid", String(c.pid), "/T", "/F"], { stdio: "ignore" });
    else c.kill("SIGTERM");
  }
  await new Promise((r) => setTimeout(r, 1500));
  rmSync(data, { recursive: true, force: true });
}

if (failures > 0) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log("Production Host checks passed.");
