/**
 * Captures README screenshots of the running app (npm run dev must be running).
 * Only the landing page and the bundled sample report (synthetic fixture) are
 * captured, so no third-party website content ends up in the repository.
 *
 *   npx tsx scripts/capture-readme-screenshots.ts [baseUrl]
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { REPO_ROOT } from "../tests/integration/fixture-server.js";

const base = process.argv[2] ?? "http://localhost:3000";
const out = path.join(REPO_ROOT, "docs", "screenshots");
mkdirSync(out, { recursive: true });

const shots: { name: string; path: string; height?: number }[] = [
  { name: "landing", path: "/" },
  { name: "report-design", path: "/sample#design" },
  { name: "report-ai-origin", path: "/sample#ai" },
  { name: "report-responsive", path: "/sample#responsive" },
];

const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1360, height: 860 },
    deviceScaleFactor: 1,
  });
  for (const s of shots) {
    await page.goto(`${base}${s.path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(out, `${s.name}.png`) });
    console.log(`saved docs/screenshots/${s.name}.png`);
  }
} finally {
  await browser.close();
}
