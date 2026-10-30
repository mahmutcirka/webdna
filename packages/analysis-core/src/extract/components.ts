import type {
  ComponentKind,
  ComponentPattern,
  Confidence,
  ElementRef,
  Layout,
} from "@webdna/shared";
import type { RawElement } from "../browser/extract-script.js";
import { parseColor, toHex } from "./color.js";
import { MAX_SAMPLES, ValueCounter, px, ref, visibleStyled, type ViewportData } from "./common.js";

export type Styled = RawElement & { s: NonNullable<RawElement["s"]> };

export function hasBg(el: Styled): boolean {
  const c = parseColor(el.s.bg);
  return !!c && c.a > 0;
}
export function hasBorder(el: Styled): boolean {
  return el.s.bs !== "none" && el.s.bw.split(" ").some((v) => (px(v) ?? 0) > 0);
}
export function hasShadow(el: Styled): boolean {
  return !!el.s.sh && el.s.sh !== "none";
}
function radius(el: Styled): number {
  return px(el.s.br) ?? 0;
}
function padX(el: Styled): number {
  const parts = el.s.pad.split(" ");
  return Math.max(px(parts[1]) ?? 0, px(parts[3]) ?? 0);
}
export function bgHex(el: Styled): string {
  const c = parseColor(el.s.bg);
  return c ? toHex(c) : "none";
}

export function isButtonLike(el: Styled): boolean {
  if (el.tag === "button" || el.role === "button") return true;
  if (el.tag === "input" && ["button", "submit", "reset"].includes(el.a?.type ?? "")) return true;
  if (el.tag !== "a") return false;
  return (hasBg(el) || hasBorder(el)) && padX(el) >= 8 && el.h >= 24 && el.h <= 72 && el.text <= 40;
}

class PatternGroup {
  private readonly groups = new Map<
    string,
    { styles: Record<string, string>; count: number; examples: ElementRef[] }
  >();
  constructor(
    readonly kind: ComponentKind,
    readonly basis: string,
    readonly confidence: Confidence,
  ) {}
  add(signature: string, styles: Record<string, string>, el: RawElement, vp: ViewportData["id"]) {
    const g = this.groups.get(signature) ?? { styles, count: 0, examples: [] };
    g.count += 1;
    if (g.examples.length < MAX_SAMPLES) g.examples.push(ref(el, vp));
    this.groups.set(signature, g);
  }
  patterns(min = 1): ComponentPattern[] {
    return [...this.groups.entries()]
      .filter(([, g]) => g.count >= min)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 8)
      .map(([signature, g]) => ({
        kind: this.kind,
        variant: signature,
        count: g.count,
        confidence: this.confidence,
        basis: this.basis,
        styles: g.styles,
        examples: g.examples,
      }));
  }
}

/**
 * Heuristic component-pattern detection from measured DOM/CSS. These are visual
 * patterns; they do not identify the framework component that produced them.
 */
export function detectComponents(vp: ViewportData): ComponentPattern[] {
  const els = vp.raw.elements;
  const byIndex = (i: number) => (i >= 0 ? els[i] : undefined);

  const buttons = new PatternGroup(
    "button",
    "button/role=button elements, or links with padding and a background or border",
    "high",
  );
  const links = new PatternGroup("link", "Anchors that are not styled as buttons", "high");
  const inputs = new PatternGroup("input", "input, select and textarea elements", "high");
  const forms = new PatternGroup("form", "form elements", "high");
  const navs = new PatternGroup("navigation", "nav elements or role=navigation", "high");
  const headers = new PatternGroup("header", "header elements or role=banner", "high");
  const footers = new PatternGroup("footer", "footer elements or role=contentinfo", "high");
  const dialogs = new PatternGroup("dialog", "dialog elements or role=dialog/alertdialog", "high");
  const badges = new PatternGroup(
    "badge",
    "Small rounded elements with their own background and short text",
    "low",
  );
  const cards = new PatternGroup(
    "card",
    "Repeated sibling boxes with a border, shadow or distinct background",
    "medium",
  );
  const repeated = new PatternGroup(
    "repeated_section",
    "Three or more siblings sharing tag and class list",
    "medium",
  );
  const images = new PatternGroup(
    "image_container",
    "Elements wrapping an image with clipping or rounded corners",
    "low",
  );

  const siblingGroups = new Map<string, Styled[]>();

  for (const raw of els) {
    if (!visibleStyled(raw)) continue;
    const el = raw as Styled;
    const parent = byIndex(el.p);

    if (isButtonLike(el)) {
      const styles = {
        background: bgHex(el),
        color: el.s.color,
        radius: el.s.br,
        padding: el.s.pad,
        fontSize: el.s.fs,
        fontWeight: el.s.fw,
        border: hasBorder(el)
          ? `${el.s.bw.split(" ")[0]} ${el.s.bs} ${toHex(parseColor(el.s.bc) ?? { r: 0, g: 0, b: 0, a: 1 })}`
          : "none",
      };
      buttons.add(`${bgHex(el)} · radius ${el.s.br} · ${el.s.fs}`, styles, el, vp.id);
    } else if (el.tag === "a") {
      links.add(`${el.s.color} · ${el.s.fs}`, { color: el.s.color, fontSize: el.s.fs }, el, vp.id);
    }
    if (
      ["input", "select", "textarea"].includes(el.tag) &&
      !["hidden", "button", "submit", "reset"].includes(el.a?.type ?? "")
    ) {
      inputs.add(
        `${el.tag}${el.a?.type ? `[${el.a.type}]` : ""} · radius ${el.s.br}`,
        { border: `${el.s.bw.split(" ")[0]} ${el.s.bs}`, radius: el.s.br, height: `${el.h}px` },
        el,
        vp.id,
      );
    }
    if (el.tag === "form") forms.add("form", {}, el, vp.id);
    if (el.tag === "nav" || el.role === "navigation")
      navs.add(
        el.fixed ? "fixed/sticky nav" : "nav",
        { display: el.s.d, position: el.s.pos },
        el,
        vp.id,
      );
    if (el.tag === "header" || el.role === "banner")
      headers.add(
        el.fixed ? "fixed/sticky header" : "header",
        { position: el.s.pos, height: `${el.h}px` },
        el,
        vp.id,
      );
    if (el.tag === "footer" || el.role === "contentinfo")
      footers.add("footer", { background: bgHex(el) }, el, vp.id);
    if (el.tag === "dialog" || el.role === "dialog" || el.role === "alertdialog")
      dialogs.add(el.tag, {}, el, vp.id);

    const parentBg = parent?.s ? parent.s.bg : "";
    if (
      el.text > 0 &&
      el.text <= 24 &&
      el.h <= 32 &&
      el.w <= 220 &&
      hasBg(el) &&
      el.s.bg !== parentBg &&
      (radius(el) >= 4 || el.s.br.endsWith("%")) &&
      !isButtonLike(el) &&
      el.tag !== "a" &&
      el.kids <= 2
    ) {
      badges.add(
        `${bgHex(el)} · radius ${el.s.br}`,
        { background: bgHex(el), color: el.s.color, fontSize: el.s.fs },
        el,
        vp.id,
      );
    }

    if (el.p >= 0 && el.w >= 40 && el.h >= 24) {
      const key = `${el.p}|${el.tag}|${(el.cls ?? "").split(/\s+/).sort().join(".")}`;
      const list = siblingGroups.get(key) ?? [];
      list.push(el);
      siblingGroups.set(key, list);
    }

    if (["img", "picture"].includes(el.tag) && parent?.s && parent.vis) {
      const p = parent as Styled;
      if (p.s.ox === "hidden" || radius(p) > 0) {
        images.add(
          `radius ${p.s.br}${p.s.ox === "hidden" ? " · clipped" : ""}`,
          { radius: p.s.br, overflow: p.s.ox },
          p,
          vp.id,
        );
      }
    }
  }

  for (const group of siblingGroups.values()) {
    if (group.length < 3) continue;
    const first = group[0]!;
    const sameSize =
      group.filter((g) => Math.abs(g.w - first.w) <= first.w * 0.15).length >=
      Math.ceil(group.length * 0.6);
    if (!sameSize) continue;
    const boxed = group.filter(
      (g) => hasBorder(g) || hasShadow(g) || (hasBg(g) && g.s.bg !== (els[g.p]?.s?.bg ?? "")),
    ).length;
    if (boxed >= Math.ceil(group.length * 0.6) && first.w >= 120 && first.h >= 80) {
      for (const g of group) {
        cards.add(
          `${first.tag} · ${hasShadow(first) ? "shadow" : hasBorder(first) ? "border" : "background"} · radius ${first.s.br}`,
          {
            background: bgHex(first),
            radius: first.s.br,
            shadow: first.s.sh,
            border: `${first.s.bw.split(" ")[0]} ${first.s.bs}`,
          },
          g,
          vp.id,
        );
      }
    } else if (first.cls) {
      repeated.add(
        `${group.length}× ${first.tag}.${first.cls.split(/\s+/).slice(0, 3).join(".")}`,
        { tag: first.tag },
        first,
        vp.id,
      );
    }
  }

  return [
    ...headers.patterns(),
    ...navs.patterns(),
    ...buttons.patterns(),
    ...links.patterns(),
    ...cards.patterns(2),
    ...inputs.patterns(),
    ...forms.patterns(),
    ...dialogs.patterns(),
    ...badges.patterns(2),
    ...repeated.patterns(),
    ...images.patterns(2),
    ...footers.patterns(),
  ];
}

export function analyzeLayout(vp: ViewportData): Layout {
  let flex = 0;
  let grid = 0;
  const gridCols = new Map<number, { count: number; examples: ElementRef[] }>();
  const widths = new ValueCounter();
  const landmarks = new Map<string, { tag: string; role?: string; count: number }>();
  const headings = new Map<number, number>();

  for (const el of vp.raw.elements) {
    if (!visibleStyled(el)) continue;
    const d = el.s.d;
    if (d.includes("flex")) flex += 1;
    if (d.includes("grid")) {
      grid += 1;
      const cols =
        el.s.gtc === "none" ? 1 : el.s.gtc.split(/\s+(?![^(]*\))/).filter(Boolean).length;
      const g = gridCols.get(cols) ?? { count: 0, examples: [] };
      g.count += 1;
      if (g.examples.length < MAX_SAMPLES) g.examples.push(ref(el, vp.id));
      gridCols.set(cols, g);
    }
    if (el.s.mw !== "none" && px(el.s.mw) && (px(el.s.mw) ?? 0) >= 320)
      widths.add(el.s.mw, "max-width", el, vp.id);
    if (
      ["header", "nav", "main", "footer", "aside", "section", "article"].includes(el.tag) ||
      el.role
    ) {
      const key = `${el.tag}|${el.role ?? ""}`;
      const l = landmarks.get(key) ?? { tag: el.tag, role: el.role, count: 0 };
      l.count += 1;
      landmarks.set(key, l);
    }
    const h = /^h([1-6])$/.exec(el.tag);
    if (h) headings.set(Number(h[1]), (headings.get(Number(h[1])) ?? 0) + 1);
  }

  return {
    flexContainers: flex,
    gridContainers: grid,
    gridPatterns: [...gridCols.entries()]
      .map(([columns, g]) => ({ columns, ...g }))
      .sort((a, b) => b.count - a.count),
    containerWidths: widths.values(10),
    landmarks: [...landmarks.values()].sort((a, b) => b.count - a.count).slice(0, 20),
    headingOutline: [...headings.entries()]
      .map(([level, count]) => ({ level, count }))
      .sort((a, b) => a.level - b.level),
  };
}
