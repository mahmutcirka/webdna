import os from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests of the real UI → API → worker → browser pipeline against local
 * fixture sites. DNS is disabled (WEBDNA_OFFLINE_DNS) so nothing leaves the machine;
 * only the two fixture ports are allow-listed on loopback.
 */
const API_PORT = 4311;
const WEB_PORT = 3311;
const dataDir = path.join(os.tmpdir(), `webdna-e2e-${process.pid}`);
process.env.WEBDNA_E2E_DATA_DIR = dataDir;

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  retries: 0,
  globalTeardown: "./tests/e2e/teardown.ts",
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
    viewport: { width: 1360, height: 900 },
  },
  outputDir: path.join(os.tmpdir(), "webdna-e2e-results"),
  webServer: [
    {
      command: "npx tsx tests/e2e/serve-fixtures.ts",
      url: "http://127.0.0.1:4561/",
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: "npx tsx apps/server/src/index.ts",
      url: `http://127.0.0.1:${API_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        WEBDNA_PORT: String(API_PORT),
        WEBDNA_DATA_DIR: dataDir,
        WEBDNA_OFFLINE_DNS: "1",
        WEBDNA_UNSAFE_ALLOW_LOOPBACK: "127.0.0.1:4561,127.0.0.1:4562",
        WEBDNA_MAX_CONCURRENCY: "1",
        WEBDNA_RETENTION_DAYS: "0",
      },
    },
    {
      command: `npx next dev -p ${WEB_PORT}`,
      cwd: "apps/web",
      url: `http://127.0.0.1:${WEB_PORT}/`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: { WEBDNA_API_URL: `http://127.0.0.1:${API_PORT}`, NEXT_TELEMETRY_DISABLED: "1" },
    },
  ],
});
