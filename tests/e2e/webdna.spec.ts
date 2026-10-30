/// <reference lib="dom" />
import { expect, test, type Page } from "@playwright/test";
import { unzipSync, strFromU8 } from "fflate";
import { ReportSchema } from "@webdna/shared";

const BASIC = "http://127.0.0.1:4561/";
const MARKER = "http://127.0.0.1:4562/";
const TABS = [
  "overview",
  "design",
  "typography",
  "components",
  "layout",
  "responsive",
  "source",
  "ai",
  "a11y",
  "assets",
  "prompt",
  "export",
];

test.describe.configure({ mode: "serial" });

let basicScanId = "";

async function submit(page: Page, url: string) {
  await page.goto("/");
  // Wait for hydration so the controlled input keeps what we type.
  await page.waitForLoadState("networkidle");
  const input = page.getByLabel("Website URL");
  await expect(async () => {
    await input.fill(url);
    await expect(page.getByRole("button", { name: "Analyze website" })).toBeEnabled({
      timeout: 1000,
    });
  }).toPass({ timeout: 60_000 });
  await page.getByRole("button", { name: "Analyze website" }).click();
}

test("submitting a URL shows real stage progress and then the report", async ({ page }) => {
  await submit(page, BASIC);
  await page.waitForURL(/\/scans\/[0-9a-f-]{36}$/);
  basicScanId = page.url().split("/").pop()!;
  // Progress card with the backend's stage list appears while the worker runs.
  await expect(page.getByText("Validating URL")).toBeVisible();
  // The report replaces the progress view once the scan completes.
  await expect(page.getByRole("heading", { name: "Northwind Studio — Fixture" })).toBeVisible({
    timeout: 150_000,
  });
  await expect(page.getByRole("button", { name: "AI-origin" })).toBeVisible();

  const scan = await (await page.request.get(`/api/scans/${basicScanId}`)).json();
  expect(scan.scan.status).toBe("completed");
  expect(scan.scan.stages.every((s: { state: string }) => s.state === "done")).toBe(true);
});

test("report tabs render measured data and honest AI-origin wording", async ({ page }) => {
  await page.goto(`/scans/${basicScanId}#design`);
  await expect(page.getByText("#2f6f4e").first()).toBeVisible();
  await page.goto(`/scans/${basicScanId}#responsive`);
  await expect(page.getByText("Grid columns change from 3 to 1.").first()).toBeVisible();
  await page.goto(`/scans/${basicScanId}#ai`);
  await expect(page.getByText("No meaningful AI-origin evidence found").first()).toBeVisible();
  await expect(page.getByText(/not calibrated probabilities/)).toBeVisible();
  await expect(page.getByText(/This does not show that no AI tools were used/)).toBeVisible();
});

test("evidence inspector shows the selector and highlights the element on the screenshot", async ({
  page,
}) => {
  await page.goto(`/scans/${basicScanId}#design`);
  await page.getByRole("button", { name: /#2f6f4e/ }).click();
  const dialog = page.getByRole("dialog", { name: "Evidence inspector" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Colour #2f6f4e")).toBeVisible();
  const shot = dialog.getByRole("img", { name: "desktop screenshot" }).first();
  await expect(shot).toBeVisible();
  // The screenshot must actually load from the API.
  expect(await shot.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(
    true,
  );
  await expect(dialog.getByText(/Measured box \d+×\d+/).first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("exports contain the analysed data", async ({ page }) => {
  const get = (format: string) => page.request.get(`/api/scans/${basicScanId}/export/${format}`);

  const json = await get("json");
  expect(json.headers()["content-type"]).toContain("application/json");
  const report = ReportSchema.parse(await json.json());
  expect(report.scanId).toBe(basicScanId);
  expect(report.aiOrigin.detectors.length).toBeGreaterThan(30);

  const css = await (await get("css")).text();
  expect(css).toMatch(/--webdna-color-\d+: #2f6f4e;/);
  expect(css).toContain("--nw-accent: #2f6f4e;");

  const tw = await (await get("tailwind")).text();
  expect(tw).toContain("@theme {");
  expect(tw).toMatch(/--color-observed-\d+: #2f6f4e;/);
  expect(tw).toMatch(/--font-observed-1: /);

  const md = await (await get("markdown")).text();
  expect(md).toContain("# WebDNA report: Northwind Studio — Fixture");
  expect(md).toContain("**Evidence category: No meaningful AI-origin evidence found**");
  expect(md).toContain("### Limitations");

  const zipRes = await get("evidence");
  expect(zipRes.headers()["content-type"]).toBe("application/zip");
  const files = unzipSync(new Uint8Array(await zipRes.body()));
  expect(Object.keys(files).sort()).toEqual(
    expect.arrayContaining([
      "report.json",
      "README.txt",
      "screenshots/desktop-viewport.jpg",
      "screenshots/mobile-full.jpg",
    ]),
  );
  expect(ReportSchema.parse(JSON.parse(strFromU8(files["report.json"]!))).scanId).toBe(basicScanId);
  expect(files["screenshots/desktop-viewport.jpg"]!.subarray(0, 2)).toEqual(
    new Uint8Array([0xff, 0xd8]),
  );

  // The UI download link delivers the same file.
  await page.goto(`/scans/${basicScanId}#export`);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download" }).first().click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^webdna-127\.0\.0\.1-[0-9a-f]{8}\.json$/);
});

test("the AI prompt tab builds an original rebuild brief that can be copied and downloaded", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(`/scans/${basicScanId}`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "AI prompt" }).click();
  const preview = page.getByTestId("prompt-preview");
  await expect(preview).toContainText("## 1. Originality rules (non-negotiable)");
  await expect(preview).toContainText("--color-accent: #2f6f4e;");
  await expect(preview).toContainText("@theme {");
  await expect(preview).toContainText("### 5.3 Card grid");
  await expect(preview).not.toContainText("Northwind");

  await page.getByRole("button", { name: "HTML + CSS" }).click();
  await expect(preview).toContainText(":root {");
  await expect(preview).not.toContainText("@theme {");

  await page
    .getByRole("group", { name: "Prompt language" })
    .getByRole("button", { name: "Türkçe" })
    .click();
  await expect(preview).toContainText("Özgünlük kuralları");
  // The UI itself stays English.
  await expect(page.getByRole("button", { name: "Copy prompt" })).toBeVisible();

  await page.getByTestId("prompt-copy").click();
  await expect(page.getByTestId("prompt-copy")).toHaveText("Copied");
  // The OS clipboard may convert line endings (Windows: CRLF).
  const copied = (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, "\n");
  expect(copied).toBe(await preview.textContent());

  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("prompt-download").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(
    /^webdna-127\.0\.0\.1-[0-9a-f]{8}\.html\.tr\.prompt\.md$/,
  );

  const api = await page.request.get(`/api/scans/${basicScanId}/export/prompt?stack=html&lang=tr`);
  expect(api.headers()["content-type"]).toContain("text/markdown");
  expect(await api.text()).toBe(copied);
});

// Fonts differ by OS: CI (Linux) failed with 13 px overflow on "/" that Windows did not show.
// Every check therefore also runs with a deliberately wide font stack.
// Turkish strings are longer than English ones, so both languages are checked.
for (const [lang, font] of [
  ["en", "system default"],
  ["en", "wide (Verdana / DejaVu Sans)"],
  ["tr", "system default"],
  ["tr", "wide (Verdana / DejaVu Sans)"],
] as const) {
  test(`no horizontal overflow at 375 px on any page or report tab — ${lang}, ${font} font`, async ({
    page,
    context,
    baseURL,
  }) => {
    await context.addCookies([{ name: "webdna-locale", value: lang, url: baseURL! }]);
    await page.setViewportSize({ width: 375, height: 812 });
    if (font.startsWith("wide")) {
      await page.addInitScript(() => {
        const add = () => {
          const s = document.createElement("style");
          s.textContent = '*{font-family:Verdana,"DejaVu Sans",sans-serif !important}';
          document.head.appendChild(s);
        };
        if (document.head) add();
        else document.addEventListener("DOMContentLoaded", add);
      });
    }
    const overflow = () =>
      page.evaluate(() => {
        const vw = window.innerWidth;
        const culprits = [...document.querySelectorAll("body *")]
          .filter((el) => {
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.right <= vw + 0.5) return false;
            for (let p = el.parentElement; p; p = p.parentElement) {
              if (getComputedStyle(p).overflowX !== "visible") return false;
            }
            return true;
          })
          .slice(0, 3)
          .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 50)}`);
        return { px: document.documentElement.scrollWidth - vw, culprits };
      });
    for (const path of ["/", "/dashboard", "/compare", "/detectors", "/sample"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const o = await overflow();
      expect(o.px, `${path} ${o.culprits.join(", ")}`).toBeLessThanOrEqual(0);
    }
    await page.goto(`/scans/${basicScanId}`);
    await expect(page.getByRole("heading", { name: "Northwind Studio — Fixture" })).toBeVisible();
    for (const tab of TABS) {
      await page.evaluate((t) => (window.location.hash = t), tab);
      await page.waitForTimeout(250);
      const o = await overflow();
      expect(o.px, `tab ${tab} ${o.culprits.join(", ")}`).toBeLessThanOrEqual(0);
    }
  });
}

test("explicit AI-builder markers are reported with evidence, not as an accusation", async ({
  page,
}) => {
  await submit(page, MARKER);
  await page.waitForURL(/\/scans\//);
  await expect(page.getByRole("heading", { name: "Bloom Yoga" })).toBeVisible({ timeout: 150_000 });
  await page.getByRole("button", { name: "AI-origin" }).click();
  await expect(page.getByText("Strong AI-related evidence found").first()).toBeVisible();
  await expect(page.getByText(/Lovable \(formerly GPT Engineer\) · ai builder/)).toBeVisible();
  await page.getByRole("button", { name: "Inspect evidence" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Evidence inspector" });
  await expect(dialog.getByText(/gptengineer\.js/).first()).toBeVisible();
  await expect(dialog.getByText("Alternative explanations")).toBeVisible();
});

test("invalid URLs are rejected inline", async ({ page }) => {
  await submit(page, "ftp://example.com/file");
  await expect(page.locator("p[role=alert]")).toContainText(
    "Only http:// and https:// URLs can be analyzed.",
  );
  await expect(page).toHaveURL(/\/$/);
});

test("private destinations fail honestly without a report", async ({ page }) => {
  await submit(page, "http://10.0.0.1/");
  await page.waitForURL(/\/scans\//);
  await expect(page.getByText("Analysis failed")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/blocked_destination/).first()).toBeVisible();
  await expect(page.getByText(/No report was generated/)).toBeVisible();
});

test("DNS failures are reported as such", async ({ page }) => {
  await submit(page, "https://example.com/");
  await page.waitForURL(/\/scans\//);
  await expect(page.getByText(/dns_failure/).first()).toBeVisible({ timeout: 60_000 });
});

test("a running scan can be cancelled from the progress view", async ({ page }) => {
  await submit(page, `${BASIC}__slow`);
  await page.waitForURL(/\/scans\//);
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("Analysis cancelled")).toBeVisible({ timeout: 60_000 });
});

test("dashboard lists scans and compare shows detector versions", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("link", { name: "Northwind Studio — Fixture" })).toBeVisible();
  await expect(page.getByText("failed").first()).toBeVisible();
  const scans = (await (await page.request.get("/api/scans")).json()).scans.filter(
    (s: { status: string }) => s.status === "completed",
  );
  expect(scans.length).toBeGreaterThanOrEqual(2);
  await page.goto(`/compare?a=${scans[1].id}&b=${scans[0].id}`);
  await expect(page.getByText("All detectors ran at the same versions.")).toBeVisible();
  await expect(page.getByText(/different domains|Design tokens/).first()).toBeVisible();
});

test("DNS-rebinding requests through the web app's /api proxy are rejected", async () => {
  const http = await import("node:http");
  const status = (host: string) =>
    new Promise<number>((resolve, reject) => {
      const req = http.request(
        { host: "127.0.0.1", port: 3311, path: "/api/scans", headers: { host } },
        (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        },
      );
      req.on("error", reject);
      req.end();
    });
  expect(await status("127.0.0.1:3311")).toBe(200);
  expect(await status("attacker.example:3311")).toBe(403);
});

for (const lang of ["en", "tr"] as const) {
  test(`pages render without hydration or runtime errors — ${lang}`, async ({
    page,
    context,
    baseURL,
  }) => {
    await context.addCookies([{ name: "webdna-locale", value: lang, url: baseURL! }]);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`${page.url()} :: ${e.message.split("\n")[0]}`));
    page.on("console", (m) => {
      if (m.type() === "error" && /hydrat/i.test(m.text()))
        errors.push(`${page.url()} :: ${m.text().split("\n")[0]}`);
    });
    for (const path of [
      "/",
      "/dashboard",
      "/compare",
      "/detectors",
      "/sample",
      `/scans/${basicScanId}`,
    ]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(300);
    }
    expect(errors).toEqual([]);
  });
}

test("the language switcher translates the UI and the choice persists", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Inspect how a website is built",
  );

  await page.getByRole("button", { name: "Switch language to Türkçe" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Bir web sitesinin nasıl yapıldığını inceleyin",
  );
  await expect(page.locator("html")).toHaveAttribute("lang", "tr");
  await expect(page.getByRole("link", { name: "Panel" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Web sitesini analiz et" })).toBeVisible();

  // The choice is stored in a cookie, so server-rendered pages come back in Turkish.
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Bir web sitesinin");
  await page.goto("/dashboard");
  await expect(page.getByText("Son taramalar")).toBeVisible();
  await expect(page.getByText("tamamlandı").first()).toBeVisible();

  // Report: UI labels are Turkish; engine-generated text is flagged as English.
  await page.goto(`/scans/${basicScanId}`);
  await page.getByRole("button", { name: "Yapay zekâ kökeni" }).click();
  await expect(
    page.getByText("Anlamlı bir yapay zekâ kökeni kanıtı bulunamadı").first(),
  ).toBeVisible();
  await expect(page.getByText(/kalibre edilmiş olasılıklar değildir/)).toBeVisible();
  await expect(page.getByText(/analiz motorunun ürettiği/)).toBeVisible();
  await page.getByRole("button", { name: "Tasarım sistemi" }).click();
  await page.getByRole("button", { name: /#2f6f4e/ }).click();
  const dialog = page.getByRole("dialog", { name: "Kanıt denetçisi" });
  await expect(dialog.getByText("Renk #2f6f4e")).toBeVisible();
  await expect(dialog.getByRole("img", { name: "masaüstü ekran görüntüsü" }).first()).toBeVisible();
  await page.keyboard.press("Escape");

  // Switching back restores English.
  await page.getByRole("button", { name: "Dili English olarak değiştir" }).click();
  await expect(page.getByRole("button", { name: "AI-origin" })).toBeVisible();
});

test("Turkish browsers get Turkish by default; a saved choice wins", async ({
  browser,
  baseURL,
}) => {
  const tr = await browser.newContext({
    baseURL,
    locale: "tr-TR",
    extraHTTPHeaders: { "accept-language": "tr-TR,tr;q=0.9" },
  });
  const page = await tr.newPage();
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "tr");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Bir web sitesinin");
  await tr.addCookies([{ name: "webdna-locale", value: "en", url: baseURL! }]);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await tr.close();
});

test("Turkish error states are translated and keep the server detail", async ({
  page,
  context,
  baseURL,
}) => {
  await context.addCookies([{ name: "webdna-locale", value: "tr", url: baseURL! }]);
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const input = page.getByLabel("Web sitesi adresi");
  await expect(async () => {
    await input.fill("ftp://example.com/file");
    await expect(page.getByRole("button", { name: "Web sitesini analiz et" })).toBeEnabled({
      timeout: 1000,
    });
  }).toPass({ timeout: 60_000 });
  await page.getByRole("button", { name: "Web sitesini analiz et" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("Geçersiz adres.");
  await expect(page.locator("p[role=alert]")).toContainText("Only http:// and https://");

  await input.fill("http://10.0.0.1/");
  await page.getByRole("button", { name: "Web sitesini analiz et" }).click();
  await page.waitForURL(/\/scans\//);
  await expect(page.getByText("Analiz başarısız oldu")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/her zaman engellenir/)).toBeVisible();
  await expect(page.getByText("Adres doğrulanıyor")).toBeVisible();
});
