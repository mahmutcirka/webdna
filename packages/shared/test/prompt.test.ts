import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PROMPT_STACKS, ReportSchema, buildRebuildPrompt, type Report } from "../src/index";

const sample: Report = ReportSchema.parse(
  JSON.parse(
    readFileSync(
      new URL("../../../apps/web/src/sample/sample-report.json", import.meta.url),
      "utf8",
    ),
  ),
);

describe("AI rebuild prompt", () => {
  const en = buildRebuildPrompt(sample, { stack: "react-tailwind", language: "en" });

  it("contains the measured tokens, blueprint, components and checklist", () => {
    for (const hex of ["#2f6f4e", "#fbfaf7", "#1f2933"]) expect(en).toContain(hex);
    expect(en).toContain("--color-accent: #2f6f4e;");
    expect(en).toContain("--color-heading: #1f2933;");
    expect(en).toMatch(/### 5\.1 Header/);
    expect(en).toMatch(/### 5\.3 Card grid/);
    expect(en).toContain("3 per row on desktop → 1 per row on mobile");
    expect(en).toContain("## 6. Components");
    expect(en).toContain("## 9. Quality bar and acceptance checklist");
    expect(en).toMatch(/Design character \(derived from measurements\):\*\* serif headings/);
  });

  it("normalises component colours to hex or transparent", () => {
    expect(en).not.toMatch(/rgba?\(\d+, \d+, \d+(, 0)?\)`/);
    expect(en).toContain("background `transparent`");
    expect(en).not.toContain("#00000000");
  });

  it("never includes the reference site's identity", () => {
    for (const lang of ["en", "tr"] as const) {
      for (const stack of PROMPT_STACKS) {
        const p = buildRebuildPrompt(sample, { stack, language: lang });
        expect(p).not.toContain(sample.metadata.title!);
        expect(p).not.toContain("Northwind");
        expect(p).not.toContain(sample.target.domain);
        expect(p).not.toContain(sample.target.finalUrl);
        expect(p).toMatch(lang === "en" ? /\[Brand\]/ : /\[Marka\]/);
      }
    }
  });

  it("keeps the originality guardrails", () => {
    expect(en).toMatch(/Originality rules \(non-negotiable\)/);
    expect(en).toMatch(/no impersonation/);
    expect(en).toMatch(/Do \*\*not\*\* copy or recreate the reference's logo/);
  });

  it("uses @theme for Tailwind stacks and :root for plain HTML", () => {
    expect(en).toContain('@import "tailwindcss";');
    expect(en).toContain("@theme {");
    const html = buildRebuildPrompt(sample, { stack: "html", language: "en" });
    expect(html).toContain(":root {");
    expect(html).not.toContain("@theme {");
    expect(buildRebuildPrompt(sample, { stack: "nextjs-tailwind", language: "en" })).toMatch(
      /Next\.js/,
    );
  });

  it("writes a Turkish prompt", () => {
    const tr = buildRebuildPrompt(sample, { stack: "html", language: "tr" });
    expect(tr).toContain("Özgünlük kuralları");
    expect(tr).toContain("Tasarım karakteri");
    expect(tr).not.toContain("Originality rules");
  });

  it("degrades gracefully without an outline", () => {
    const old = { ...sample, outline: undefined };
    const p = buildRebuildPrompt(old, { stack: "html", language: "en" });
    expect(p).toContain("## 5.");
    expect(p).not.toMatch(/### 5\.1/);
  });

  it("is deterministic", () => {
    expect(buildRebuildPrompt(sample, { stack: "react-tailwind", language: "en" })).toBe(en);
  });
});
