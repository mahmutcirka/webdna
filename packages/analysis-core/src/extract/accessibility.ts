import type { A11yIssue, ElementRef } from "@webdna/shared";
import type { RawElement } from "../browser/extract-script.js";
import { composite, contrastRatio, parseColor, type Rgba } from "./color.js";
import { MAX_SAMPLES, px, ref, visibleStyled, type ViewportData } from "./common.js";

export const A11Y_CHECKS = [
  "document language",
  "viewport meta",
  "image alternative text",
  "accessible names for links and buttons",
  "form control labels",
  "heading structure",
  "text contrast (solid backgrounds only)",
  "touch target size (mobile)",
];

class IssueBuilder {
  private readonly issues = new Map<string, A11yIssue>();
  add(check: string, severity: A11yIssue["severity"], message: string, example?: ElementRef) {
    const key = `${check}|${message}`;
    const issue = this.issues.get(key) ?? { check, severity, message, count: 0, examples: [] };
    issue.count += 1;
    if (example && issue.examples.length < MAX_SAMPLES) issue.examples.push(example);
    this.issues.set(key, issue);
  }
  list(): A11yIssue[] {
    const order = { error: 0, warning: 1, info: 2 };
    return [...this.issues.values()].sort(
      (a, b) => order[a.severity] - order[b.severity] || b.count - a.count,
    );
  }
}

/** Effective opaque background: walk ancestors until an opaque colour; null if an image/gradient intervenes. */
function effectiveBackground(el: RawElement, els: RawElement[]): Rgba | null {
  const layers: Rgba[] = [];
  let cur: RawElement | undefined = el;
  while (cur) {
    if (cur.s) {
      if (cur.s.bgImg !== "none") return null;
      const c = parseColor(cur.s.bg);
      if (c && c.a > 0) {
        layers.push(c);
        if (c.a >= 1) break;
      }
    }
    cur = cur.p >= 0 ? els[cur.p] : undefined;
  }
  let base: Rgba = { r: 255, g: 255, b: 255, a: 1 };
  for (let i = layers.length - 1; i >= 0; i -= 1) base = composite(layers[i]!, base);
  return base;
}

/**
 * Basic, automatable accessibility observations. This is not a WCAG audit: many
 * success criteria need human judgement or assistive-technology testing.
 */
export function analyzeAccessibility(
  viewports: ViewportData[],
  viewportMeta: string | undefined,
): A11yIssue[] {
  const b = new IssueBuilder();
  const desktop = viewports.find((v) => v.id === "desktop") ?? viewports[0];
  if (!desktop) return [];
  const els = desktop.raw.elements;

  if (!desktop.raw.lang)
    b.add("document language", "warning", "The <html> element has no lang attribute.");
  if (!viewportMeta)
    b.add(
      "viewport meta",
      "warning",
      'No <meta name="viewport"> tag; mobile browsers may render a zoomed-out desktop layout.',
    );
  else if (/user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\.0)?\b/i.test(viewportMeta)) {
    b.add("viewport meta", "warning", "The viewport meta tag restricts zooming.");
  }

  let h1 = 0;
  let lastLevel = 0;
  let contrastChecked = 0;
  for (const el of els) {
    if (!visibleStyled(el)) continue;
    const r = ref(el, desktop.id);
    if (el.tag === "img" && el.a?.alt === -1 && el.w > 1 && el.h > 1)
      b.add("image alternative text", "error", "Image without an alt attribute.", r);
    if ((el.tag === "a" || el.tag === "button" || el.role === "button") && el.a?.nm === false) {
      b.add(
        "accessible names for links and buttons",
        "error",
        `<${el.tag}> without an accessible name.`,
        r,
      );
    }
    if (
      ["input", "select", "textarea"].includes(el.tag) &&
      !["hidden", "button", "submit", "reset", "image"].includes(el.a?.type ?? "") &&
      el.a?.lbl === false
    ) {
      b.add(
        "form control labels",
        "error",
        el.a?.ph
          ? "Form control labelled only by placeholder text."
          : "Form control without an associated label.",
        r,
      );
    }
    const h = /^h([1-6])$/.exec(el.tag);
    if (h) {
      const level = Number(h[1]);
      if (level === 1) h1 += 1;
      if (lastLevel > 0 && level > lastLevel + 1)
        b.add("heading structure", "info", `Heading level skipped (h${lastLevel} → h${level}).`, r);
      lastLevel = level;
    }
    if (el.text > 0 && contrastChecked < 1500) {
      const fg = parseColor(el.s.color);
      const bg = effectiveBackground(el, els);
      if (fg && bg) {
        contrastChecked += 1;
        const ratio = contrastRatio(composite(fg, bg), bg);
        const size = px(el.s.fs) ?? 16;
        const large = size >= 24 || (size >= 18.66 && Number(el.s.fw) >= 700);
        const min = large ? 3 : 4.5;
        if (ratio < min) {
          b.add(
            "text contrast (solid backgrounds only)",
            "warning",
            `Text contrast below ${min}:1 (${large ? "large" : "normal"} text).`,
            r,
          );
        }
      }
    }
  }
  if (h1 === 0) b.add("heading structure", "warning", "No visible h1 heading.");
  if (h1 > 1) b.add("heading structure", "info", `${h1} visible h1 headings.`);

  const mobile = viewports.find((v) => v.id === "mobile");
  if (mobile) {
    for (const el of mobile.raw.elements) {
      if (!visibleStyled(el)) continue;
      const interactive =
        el.tag === "button" ||
        el.role === "button" ||
        (el.tag === "a" && el.text > 0 && el.s.d !== "inline");
      if (interactive && (el.w < 24 || el.h < 24)) {
        b.add(
          "touch target size (mobile)",
          "info",
          "Interactive element smaller than 24×24 px on mobile.",
          ref(el, mobile.id),
        );
      }
    }
  }
  return b.list();
}
