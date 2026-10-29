import type { ResponsiveChange, ViewportId } from "@webdna/shared";
import type { RawElement } from "../browser/extract-script.js";
import { px, type ViewportData } from "../extract/common.js";

const KEY_TAGS = new Set([
  "header",
  "nav",
  "main",
  "footer",
  "aside",
  "section",
  "h1",
  "h2",
  "h3",
  "button",
  "form",
  "ul",
  "ol",
]);
const MAX_PER_KIND = 25;

function columns(gtc: string): number {
  if (!gtc || gtc === "none") return 1;
  return gtc.split(/\s+(?![^(]*\))/).filter(Boolean).length;
}

function isKey(el: RawElement): boolean {
  if (KEY_TAGS.has(el.tag) || el.role === "navigation" || el.role === "banner") return true;
  return (
    !!el.s && (el.s.d.includes("flex") || el.s.d.includes("grid")) && el.kids >= 2 && el.w >= 200
  );
}

function visibleNavLinks(vp: ViewportData): number {
  const els = vp.raw.elements;
  const inNav = (el: RawElement): boolean => {
    let cur: RawElement | undefined = el;
    while (cur) {
      if (cur.tag === "nav" || cur.role === "navigation") return true;
      cur = cur.p >= 0 ? els[cur.p] : undefined;
    }
    return false;
  };
  return els.filter((e) => e.tag === "a" && e.vis && inNav(e)).length;
}

function menuToggles(vp: ViewportData): RawElement[] {
  return vp.raw.elements.filter(
    (e) =>
      e.vis &&
      (e.tag === "button" || e.role === "button") &&
      (e.a?.exp !== undefined || e.a?.ctl || e.a?.pop),
  );
}

/**
 * Compare real observations between two viewports. Most differences are intentional
 * responsive design and are reported as informational; only horizontal overflow and
 * very small text are flagged as potential issues.
 */
export function compareViewports(from: ViewportData, to: ViewportData): ResponsiveChange[] {
  const changes: ResponsiveChange[] = [];
  const counts: Record<string, number> = {};
  const push = (c: ResponsiveChange) => {
    counts[c.kind] = (counts[c.kind] ?? 0) + 1;
    if ((counts[c.kind] ?? 0) <= MAX_PER_KIND) changes.push(c);
  };
  const base = { from: from.id as ViewportId, to: to.id as ViewportId };

  const toBySel = new Map(to.raw.elements.map((e) => [e.sel, e]));
  for (const a of from.raw.elements) {
    if (!isKey(a)) continue;
    const b = toBySel.get(a.sel);
    if (!b) continue;
    if (a.vis !== b.vis && (KEY_TAGS.has(a.tag) || a.role)) {
      push({
        ...base,
        kind: "visibility",
        severity: "informational",
        selector: a.sel,
        description: `<${a.tag}> is ${a.vis ? "hidden" : "shown"} at ${to.id} width.`,
        before: a.vis ? "visible" : "hidden",
        after: b.vis ? "visible" : "hidden",
      });
    }
    if (!a.s || !b.s || !a.vis || !b.vis) continue;
    if (a.s.d.includes("flex") && b.s.d.includes("flex") && a.s.fd !== b.s.fd) {
      push({
        ...base,
        kind: "layout_direction",
        severity: "informational",
        selector: a.sel,
        description: `Flex direction changes from ${a.s.fd} to ${b.s.fd}.`,
        before: a.s.fd,
        after: b.s.fd,
      });
    }
    if (a.s.d.includes("grid") && b.s.d.includes("grid")) {
      const ca = columns(a.s.gtc),
        cb = columns(b.s.gtc);
      if (ca !== cb)
        push({
          ...base,
          kind: "columns",
          severity: "informational",
          selector: a.sel,
          description: `Grid columns change from ${ca} to ${cb}.`,
          before: String(ca),
          after: String(cb),
        });
    }
    if (/^h[1-3]$/.test(a.tag) && a.s.fs !== b.s.fs) {
      push({
        ...base,
        kind: "typography",
        severity: "informational",
        selector: a.sel,
        description: `<${a.tag}> font size changes from ${a.s.fs} to ${b.s.fs}.`,
        before: a.s.fs,
        after: b.s.fs,
      });
    }
  }

  const smallText = to.raw.elements.filter(
    (e) => e.vis && e.s && e.text > 20 && (px(e.s.fs) ?? 16) < 12,
  );
  if (to.id === "mobile" && smallText.length > 0) {
    push({
      ...base,
      kind: "typography",
      severity: "potential_issue",
      selector: smallText[0]!.sel,
      description: `${smallText.length} text element(s) render below 12px on mobile.`,
    });
  }

  if (to.raw.docWidth > to.raw.viewportWidth + 1) {
    const culprits = to.raw.overflowing.filter(
      (o) => !from.raw.overflowing.some((f) => f.sel === o.sel),
    );
    push({
      ...base,
      kind: "overflow",
      severity: "potential_issue",
      selector: culprits[0]?.sel ?? to.raw.overflowing[0]?.sel,
      description: `Document is ${to.raw.docWidth}px wide in a ${to.raw.viewportWidth}px viewport (horizontal scrolling).`,
      before: `${from.raw.docWidth}px`,
      after: `${to.raw.docWidth}px`,
    });
  }

  const navA = visibleNavLinks(from),
    navB = visibleNavLinks(to);
  const togglesA = menuToggles(from).length,
    togglesB = menuToggles(to);
  if (navB < navA && togglesB.length > togglesA) {
    push({
      ...base,
      kind: "navigation",
      severity: "informational",
      selector: togglesB[0]?.sel,
      description: `Navigation collapses: ${navA} visible nav links become ${navB}, and a menu toggle button appears.`,
      before: `${navA} links`,
      after: `${navB} links + toggle`,
    });
  } else if (navB < navA && navA - navB >= 2) {
    push({
      ...base,
      kind: "navigation",
      severity: "informational",
      description: `Visible navigation links drop from ${navA} to ${navB} without a detected menu toggle.`,
      before: `${navA} links`,
      after: `${navB} links`,
    });
  }

  const mainA = from.raw.elements.find((e) => e.tag === "main" && e.vis);
  const mainB = mainA ? toBySel.get(mainA.sel) : undefined;
  if (mainA && mainB?.vis) {
    push({
      ...base,
      kind: "geometry",
      severity: "informational",
      selector: mainA.sel,
      description: `<main> width changes from ${mainA.w}px to ${mainB.w}px.`,
      before: `${mainA.w}px`,
      after: `${mainB.w}px`,
    });
  }
  return changes;
}

/** Which declared breakpoints separate two viewport widths. */
export function breakpointsBetween(breakpoints: number[], a: number, b: number): number[] {
  const [lo, hi] = a < b ? [a, b] : [b, a];
  return breakpoints.filter((bp) => bp > lo && bp <= hi);
}
