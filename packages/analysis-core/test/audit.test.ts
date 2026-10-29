import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ReportSchema, type Report } from "@webdna/shared";
import { analyzeCss } from "../src/source/css.js";
import { analyzeJs } from "../src/source/js.js";
import { exportCssVariables, exportMarkdown, exportTailwindTheme } from "../src/export/index.js";

const sample = ReportSchema.parse(
  JSON.parse(
    readFileSync(
      path.resolve(import.meta.dirname, "../../../apps/web/src/sample/sample-report.json"),
      "utf8",
    ),
  ),
) as Report;
const clone = (): Report => structuredClone(sample);

describe("pre-release audit: resource exhaustion in static analysis", () => {
  it("handles 2 MB of unclosed CSS comments in bounded time", () => {
    const started = performance.now();
    analyzeCss("evil.css", "/*a".repeat(700_000));
    expect(performance.now() - started).toBeLessThan(3000);
  });

  it("handles 1.5 MB of unclosed JS banner comments in bounded time", () => {
    const started = performance.now();
    analyzeJs("evil.js", "/*!a".repeat(375_000));
    expect(performance.now() - started).toBeLessThan(3000);
  });

  it("caps the number of stored comments", () => {
    const r = analyzeCss("many.css", "/* c */ a{}".repeat(10_000));
    expect(r.comments.length).toBeLessThanOrEqual(50);
  });
});

describe("pre-release audit: export injection", () => {
  it("escapes HTML and code-span breakers from page-controlled text in Markdown", () => {
    const r = clone();
    r.metadata.title = '<img src=x onerror="alert(1)">`injected`';
    r.aiOrigin.rationale = ["<script>alert(2)</script>"];
    const md = exportMarkdown(r);
    expect(md).not.toContain("<img");
    expect(md).not.toContain("<script>");
    expect(md).toContain("&lt;img");
  });

  it("drops custom properties whose names or values could break out of the declaration", () => {
    const r = clone();
    r.design.customProperties = [
      { name: "--ok", value: "#112233", selector: ":root", source: "a.css" },
      {
        name: "--evil",
        value: "red}body{background:url(//evil.example/x)",
        selector: ":root",
        source: "a.css",
      },
      { name: "--comment", value: "1px /* x */", selector: ":root", source: "a.css" },
      {
        name: "--cut",
        value: 'url("https://x.example/very-long…',
        selector: ":root",
        source: "a.css",
      },
      { name: "--bad name;", value: "1", selector: ":root", source: "a.css" },
    ];
    const css = exportCssVariables(r);
    expect(css).toContain("--ok: #112233;");
    expect(css).not.toContain("evil.example");
    expect(css).not.toContain("--comment");
    expect(css).not.toContain("--cut");
    expect(css).not.toContain("--bad name");
    // Braces must stay balanced.
    expect((css.match(/\{/g) ?? []).length).toBe((css.match(/\}/g) ?? []).length);
  });

  it("neutralises comment terminators and braces in measured values", () => {
    const r = clone();
    r.target.finalUrl = "https://x.example/*/}body{color:red}";
    r.design.typography.families[0]!.stack = 'Inter, "a;}body{color:red}"';
    for (const out of [exportCssVariables(r), exportTailwindTheme(r)]) {
      // The URL may only appear inside a comment, and the comment must not be terminated early.
      expect(out).not.toMatch(/\*\/\}body/);
      const code = out.replace(/\/\*[\s\S]*?\*\//g, "");
      expect((code.match(/\{/g) ?? []).length).toBe((code.match(/\}/g) ?? []).length);
      expect(code).not.toContain("body{color:red}");
    }
  });
});
