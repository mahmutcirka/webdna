import { describe, expect, it } from "vitest";
import { contrastRatio, parseColor, toHex } from "../src/extract/color.js";
import { analyzeCss, classifyClassNames } from "../src/source/css.js";
import { analyzeJs, summarizeSourcePaths } from "../src/source/js.js";
import { compareViewports } from "../src/responsive/compare.js";
import { extractDesignSystem } from "../src/extract/design.js";
import { detectComponents } from "../src/extract/components.js";
import type { RawElement, RawExtraction, RawStyles } from "../src/browser/extract-script.js";
import type { ViewportData } from "../src/extract/common.js";

describe("colour parsing", () => {
  it.each([
    ["rgb(255, 0, 0)", "#ff0000"],
    ["rgba(0, 0, 0, 0.5)", "#00000080"],
    ["rgb(10 20 30 / 50%)", "#0a141e80"],
    ["#abc", "#aabbcc"],
    ["hsl(120, 100%, 50%)", "#00ff00"],
    ["oklch(0.628 0.2577 29.23)", "#ff0000"],
    ["oklch(62.8% 0.2577 29.23)", "#ff0000"],
    ["oklab(1 0 0)", "#ffffff"],
    ["lab(54.29 80.8 69.89)", "#ff0000"],
    ["color(srgb 0 0.5 1)", "#0080ff"],
    ["color(display-p3 1 0 0)", "#ff0000"],
  ])("%s → %s", (input, hex) => {
    const c = parseColor(input);
    expect(c).not.toBeNull();
    expect(toHex(c!)).toBe(hex);
  });

  it("returns null for unknown syntax", () => expect(parseColor("currentcolor")).toBeNull());
  it("treats transparent as alpha 0", () => expect(parseColor("transparent")!.a).toBe(0));
  it("computes WCAG contrast", () => {
    expect(contrastRatio(parseColor("#000")!, parseColor("#fff")!)).toBeCloseTo(21, 5);
    expect(contrastRatio(parseColor("#777")!, parseColor("#fff")!)).toBeCloseTo(4.48, 1);
  });
});

describe("CSS source analysis", () => {
  const css = `/*! demo v1.2.3 */
:root { --brand: #0055ff; --space-2: 8px; }
html { --x: 1; }
.a { color: red }
@media (min-width: 768px) { .a { color: blue } }
@media (max-width: 40em) { .b { color: green } }
@media (width >= 64rem) { .c { color: black } }
@font-face { font-family: "Inter"; src: url(x.woff2); }`;
  it("extracts rules, custom properties, breakpoints, font faces and comments", () => {
    const r = analyzeCss("test.css", css);
    expect(r.rules).toBeGreaterThanOrEqual(5);
    expect(r.customProperties.map((p) => p.name)).toEqual(["--brand", "--space-2", "--x"]);
    expect(r.breakpointsPx.sort((a, b) => a - b)).toEqual([640, 768, 1024]);
    expect(r.fontFaces).toEqual(["Inter"]);
    expect(r.comments[0]).toMatch(/demo v1\.2\.3/);
  });
  it("survives invalid CSS", () => {
    const r = analyzeCss("bad.css", "a { color: ; } }}} @media {");
    expect(r.parseErrors).toBeGreaterThanOrEqual(0);
  });
  it("classifies utility-class naming", () => {
    const classes = Array.from(
      { length: 30 },
      () => "flex items-center px-4 py-2 text-sm rounded-md bg-white",
    );
    expect(classifyClassNames(classes)[0]!.convention).toMatch(/Utility/);
  });
  it("classifies BEM naming", () => {
    const classes = Array.from(
      { length: 30 },
      (_, i) => `card card__title card--featured menu__item-${i}`,
    );
    expect(classifyClassNames(classes).map((c) => c.convention)).toContain(
      "BEM (block__element--modifier)",
    );
  });
});

describe("JS source analysis", () => {
  it("parses as data, collects comments and banners and finds source maps", () => {
    const r = analyzeJs(
      "app.js",
      "/*! lib v2.0.1 | MIT */\nexport const x = 1; // note\n//# sourceMappingURL=app.js.map\n",
    );
    expect(r.parsed).toBe(true);
    expect(r.module).toBe(true);
    expect(r.banners[0]).toMatch(/lib v2\.0\.1/);
    expect(r.sourceMappingUrl).toBe("app.js.map");
  });
  it("does not execute code", () => {
    (globalThis as Record<string, unknown>).__webdnaExecuted = false;
    analyzeJs("evil.js", "globalThis.__webdnaExecuted = true;");
    expect((globalThis as Record<string, unknown>).__webdnaExecuted).toBe(false);
  });
  it("falls back gracefully on syntax errors", () => {
    const r = analyzeJs("broken.js", "/*! keep me v1.0.0 */ function (");
    expect(r.parsed).toBe(false);
    expect(r.banners.length).toBe(1);
  });
  it("summarises source-map paths without contents", () => {
    const dirs = summarizeSourcePaths([
      "webpack://app/./src/components/Button.tsx",
      "webpack://app/./src/components/Card.tsx",
      "webpack://app/./node_modules/react/index.js",
    ]);
    expect(dirs).toEqual(
      expect.arrayContaining([
        { path: "src/components", count: 2 },
        { path: "node_modules/react", count: 1 },
      ]),
    );
  });
});

// ---- Synthetic raw extractions for responsive / design tests ----

const baseStyles: RawStyles = {
  color: "rgb(17, 17, 17)",
  bg: "rgba(0, 0, 0, 0)",
  bgImg: "none",
  bw: "0px 0px 0px 0px",
  bs: "none",
  bc: "rgb(0, 0, 0)",
  br: "0px",
  sh: "none",
  ff: "Inter, sans-serif",
  fs: "16px",
  fw: "400",
  lh: "24px",
  ls: "normal",
  tt: "none",
  d: "block",
  pos: "static",
  fd: "row",
  fwrap: "nowrap",
  jc: "normal",
  ai: "normal",
  gap: "normal normal",
  gtc: "none",
  pad: "0px 0px 0px 0px",
  mar: "0px 0px 0px 0px",
  mw: "none",
  op: "1",
  ox: "visible",
  cur: "auto",
};

function el(
  i: number,
  p: number,
  sel: string,
  tag: string,
  s: Partial<RawStyles> = {},
  extra: Partial<RawElement> = {},
): RawElement {
  return {
    i,
    p,
    sel,
    tag,
    vis: true,
    x: 0,
    y: 0,
    w: 300,
    h: 100,
    text: 0,
    fixed: false,
    kids: 0,
    s: { ...baseStyles, ...s },
    a: null,
    ...extra,
  };
}

function vp(
  id: "desktop" | "mobile",
  width: number,
  elements: RawElement[],
  docWidth = width,
): ViewportData {
  const raw: RawExtraction = {
    url: "https://x.test/",
    title: "t",
    charset: "UTF-8",
    viewportWidth: width,
    viewportHeight: 800,
    docWidth,
    docHeight: 2000,
    elementCount: elements.length,
    elements,
    truncated: false,
    text: "",
    meta: [],
    links: [],
    scripts: [],
    anchors: [],
    htmlAttributes: {},
    selectorMatches: {},
    runtimeGlobals: {},
    fonts: [],
    overflowing: docWidth > width ? [{ sel: "body > div", right: docWidth }] : [],
    dataPrefixes: {},
    inlineStyles: [],
  };
  return { id, raw };
}

describe("responsive comparison", () => {
  const desktop = vp("desktop", 1440, [
    el(0, -1, "html", "html"),
    el(1, 0, "body", "body", { bg: "rgb(255, 255, 255)" }),
    el(2, 1, "body > nav", "nav", { d: "flex" }, { kids: 3 }),
    el(3, 2, "body > nav > a:nth-of-type(1)", "a", {}, { text: 4 }),
    el(4, 2, "body > nav > a:nth-of-type(2)", "a", {}, { text: 4 }),
    el(5, 2, "body > nav > a:nth-of-type(3)", "a", {}, { text: 4 }),
    el(
      6,
      1,
      "body > section",
      "section",
      { d: "grid", gtc: "300px 300px 300px" },
      { kids: 3, w: 1000 },
    ),
    el(7, 1, "body > h1", "h1", { fs: "48px" }, { text: 20 }),
    el(8, 1, "body > div", "div", { d: "flex", fd: "row" }, { kids: 2, w: 800 }),
    el(9, 1, "body > button", "button", {}, { vis: false, a: { exp: "false" } }),
  ]);
  const mobile = vp(
    "mobile",
    390,
    [
      el(0, -1, "html", "html"),
      el(1, 0, "body", "body", { bg: "rgb(255, 255, 255)" }),
      el(2, 1, "body > nav", "nav", { d: "none" }, { vis: false, kids: 3 }),
      el(6, 1, "body > section", "section", { d: "grid", gtc: "358px" }, { kids: 3, w: 358 }),
      el(7, 1, "body > h1", "h1", { fs: "32px" }, { text: 20 }),
      el(8, 1, "body > div", "div", { d: "flex", fd: "column" }, { kids: 2, w: 358 }),
      el(9, 1, "body > button", "button", {}, { vis: true, w: 60, h: 40, a: { exp: "false" } }),
    ],
    520,
  );

  const changes = compareViewports(desktop, mobile);
  const kinds = changes.map((c) => c.kind);

  it("detects column, direction, typography, visibility and navigation changes", () => {
    expect(kinds).toEqual(
      expect.arrayContaining([
        "columns",
        "layout_direction",
        "typography",
        "visibility",
        "navigation",
      ]),
    );
    expect(changes.find((c) => c.kind === "columns")).toMatchObject({ before: "3", after: "1" });
  });
  it("only flags overflow as a potential issue", () => {
    const issues = changes.filter((c) => c.severity === "potential_issue");
    expect(issues.map((c) => c.kind)).toEqual(["overflow"]);
  });
});

describe("design-system extraction", () => {
  const data = vp("desktop", 1440, [
    el(0, -1, "html", "html"),
    el(1, 0, "body", "body", { bg: "rgb(250, 250, 250)" }, { w: 1440, h: 2000 }),
    ...Array.from({ length: 5 }, (_, i) =>
      el(
        2 + i,
        1,
        `body > p:nth-of-type(${i + 1})`,
        "p",
        { color: "rgb(31, 41, 51)", pad: "8px 16px 8px 16px" },
        { text: 100 },
      ),
    ),
    ...Array.from({ length: 3 }, (_, i) =>
      el(
        7 + i,
        1,
        `body > button:nth-of-type(${i + 1})`,
        "button",
        {
          bg: "rgb(47, 111, 78)",
          color: "rgb(255, 255, 255)",
          br: "8px",
          pad: "12px 24px 12px 24px",
        },
        { text: 6, w: 120, h: 44 },
      ),
    ),
  ]);

  it("measures colours with usage counts and keeps evidence", () => {
    const d = extractDesignSystem([data], []);
    const text = d.colors.find((c) => c.hex === "#1f2933")!;
    expect(text.count).toBe(5);
    expect(text.samples[0]!.selector).toBe("body > p:nth-of-type(1)");
  });
  it("infers roles with basis and confidence", () => {
    const d = extractDesignSystem([data], []);
    expect(d.roles.find((r) => r.role === "page background")).toMatchObject({
      value: "#fafafa",
      confidence: "high",
    });
    expect(d.roles.find((r) => r.role === "primary text")).toMatchObject({ value: "#1f2933" });
    expect(d.roles.find((r) => r.role === "accent / primary action")).toMatchObject({
      value: "#2f6f4e",
      confidence: "medium",
    });
    for (const r of d.roles) expect(r.basis.length).toBeGreaterThan(5);
  });
  it("detects button patterns from measured styles", () => {
    const comps = detectComponents(data);
    const button = comps.find((c) => c.kind === "button")!;
    expect(button.count).toBe(3);
    expect(button.styles.background).toBe("#2f6f4e");
  });
});
