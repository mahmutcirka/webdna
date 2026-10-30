import type {
  ColorValue,
  CustomProperty,
  DesignSystem,
  ElementRef,
  InferredRole,
  TypeStyle,
} from "@webdna/shared";
import type { RawElement } from "../browser/extract-script.js";
import { parseColor, toHex } from "./color.js";
import {
  MAX_SAMPLES,
  ValueCounter,
  primaryFamily,
  px,
  ref,
  round,
  visibleStyled,
  type ViewportData,
} from "./common.js";

interface ColorEntry extends ColorValue {
  textChars: number;
}

const BUTTONISH = new Set(["button"]);

/**
 * Normalise measured computed styles into a design-system inventory. Everything
 * here is a measured value; the only inferred part is `roles`, and every role keeps
 * its basis and evidence.
 */
export function extractDesignSystem(
  viewports: ViewportData[],
  customProperties: CustomProperty[],
): DesignSystem {
  const colors = new Map<string, ColorEntry>();
  const spacing = new ValueCounter();
  const radii = new ValueCounter();
  const shadows = new ValueCounter();
  const borders = new ValueCounter();
  const typeStyles = new Map<string, TypeStyle>();
  const families = new Map<
    string,
    { family: string; count: number; textChars: number; stack: string }
  >();

  const addColor = (
    raw: string,
    property: string,
    el: RawElement,
    vp: ViewportData["id"],
    area: number,
    textChars: number,
  ) => {
    const parsed = parseColor(raw);
    if (!parsed || parsed.a === 0) return;
    const hex = toHex(parsed);
    let entry = colors.get(hex);
    if (!entry) {
      entry = {
        value: hex,
        hex,
        alpha: round(parsed.a, 3),
        original: /^rgba?\(/.test(raw) ? undefined : raw,
        count: 0,
        properties: {},
        samples: [],
        backgroundArea: 0,
        textChars: 0,
      };
      colors.set(hex, entry);
    }
    entry.count += 1;
    entry.properties[property] = (entry.properties[property] ?? 0) + 1;
    entry.backgroundArea += area;
    entry.textChars += textChars;
    if (entry.samples.length < MAX_SAMPLES && !entry.samples.some((s) => s.selector === el.sel)) {
      entry.samples.push(ref(el, vp));
    }
  };

  for (const vp of viewports) {
    for (const el of vp.raw.elements) {
      if (!visibleStyled(el)) continue;
      const s = el.s;
      if (el.text > 0) addColor(s.color, "color", el, vp.id, 0, el.text);
      if (el.tag !== "html") addColor(s.bg, "background-color", el, vp.id, el.w * el.h, 0);
      const bw = s.bw.split(" ").map((v) => px(v) ?? 0);
      if (s.bs !== "none" && bw.some((w) => w > 0)) {
        addColor(s.bc, "border-color", el, vp.id, 0, 0);
        borders.add(`${s.bw.split(" ")[0]} ${s.bs}`, "border", el, vp.id);
      }

      for (const [prop, value] of [
        ["padding", s.pad],
        ["margin", s.mar],
        ["gap", s.gap],
      ] as const) {
        for (const part of value.split(" ")) {
          const n = px(part);
          if (n !== undefined && n > 0 && n < 400) spacing.add(`${round(n)}px`, prop, el, vp.id);
        }
      }
      const r = px(s.br);
      if (r !== undefined && r > 0)
        radii.add(r >= 999 ? "9999px" : `${round(r)}px`, "border-radius", el, vp.id);
      else if (s.br.endsWith("%") && parseFloat(s.br) > 0)
        radii.add(s.br, "border-radius", el, vp.id);
      if (s.sh && s.sh !== "none") shadows.add(s.sh, "box-shadow", el, vp.id);

      if (el.text > 0) {
        const family = primaryFamily(s.ff);
        const key = [family, s.fs, s.fw, s.lh, s.ls, s.tt].join("|");
        let style = typeStyles.get(key);
        if (!style) {
          style = {
            fontFamily: family,
            fontStack: s.ff,
            fontSize: s.fs,
            fontSizePx: px(s.fs) ?? 0,
            fontWeight: s.fw,
            lineHeight: s.lh,
            letterSpacing: s.ls,
            textTransform: s.tt,
            count: 0,
            textChars: 0,
            tags: {},
            samples: [],
          };
          typeStyles.set(key, style);
        }
        style.count += 1;
        style.textChars += el.text;
        style.tags[el.tag] = (style.tags[el.tag] ?? 0) + 1;
        if (style.samples.length < MAX_SAMPLES) style.samples.push(ref(el, vp.id));

        const fam = families.get(family) ?? { family, count: 0, textChars: 0, stack: s.ff };
        fam.count += 1;
        fam.textChars += el.text;
        families.set(family, fam);
      }
    }
  }

  const colorList = [...colors.values()].sort((a, b) => b.count - a.count).slice(0, 48);
  const styles = [...typeStyles.values()].sort((a, b) => b.textChars - a.textChars).slice(0, 40);
  const spacingValues = spacing.values(40);

  return {
    colors: colorList.map(({ textChars: _t, ...c }) => c),
    typography: {
      families: [...families.values()].sort((a, b) => b.textChars - a.textChars),
      styles,
      sizeScalePx: [...new Set(styles.map((s) => s.fontSizePx).filter((n) => n > 0))].sort(
        (a, b) => a - b,
      ),
    },
    spacing: spacingValues,
    spacingBase: inferSpacingBase(spacingValues.map((v) => ({ px: v.px ?? 0, count: v.count }))),
    radii: radii.values(20),
    shadows: shadows.values(16),
    borders: borders.values(16),
    customProperties,
    roles: inferRoles(viewports, colorList, styles),
  };
}

function inferSpacingBase(values: { px: number; count: number }[]): DesignSystem["spacingBase"] {
  const total = values.reduce((n, v) => n + v.count, 0);
  if (total < 20) return undefined;
  for (const base of [8, 4]) {
    const share = values.filter((v) => v.px % base === 0).reduce((n, v) => n + v.count, 0) / total;
    if (share >= 0.7) {
      return { basePx: base, share: round(share, 3), confidence: share >= 0.9 ? "high" : "medium" };
    }
  }
  return undefined;
}

function inferRoles(
  viewports: ViewportData[],
  colors: ColorEntry[],
  styles: TypeStyle[],
): InferredRole[] {
  const roles: InferredRole[] = [];
  const desktop = viewports.find((v) => v.id === "desktop") ?? viewports[0];

  // Page background: the computed background of body (or html) when opaque.
  if (desktop) {
    const body = desktop.raw.elements.find((e) => e.tag === "body");
    const html = desktop.raw.elements.find((e) => e.tag === "html");
    for (const el of [body, html]) {
      const c = el?.s ? parseColor(el.s.bg) : null;
      if (el && c && c.a > 0) {
        roles.push({
          role: "page background",
          kind: "color",
          value: toHex(c),
          confidence: "high",
          basis: `Computed background-color of <${el.tag}>.`,
          evidence: [ref(el, desktop.id)],
        });
        break;
      }
    }
  }

  // Heading text colour: the colour carrying the most characters in h1–h3.
  if (desktop) {
    const byColor = new Map<string, { chars: number; evidence: ElementRef[] }>();
    for (const el of desktop.raw.elements) {
      if (!visibleStyled(el) || !/^h[1-3]$/.test(el.tag)) continue;
      const c = parseColor(el.s.color);
      if (!c || c.a === 0) continue;
      const hex = toHex(c);
      const entry = byColor.get(hex) ?? { chars: 0, evidence: [] };
      entry.chars += Math.max(1, el.text);
      if (entry.evidence.length < MAX_SAMPLES) entry.evidence.push(ref(el, desktop.id));
      byColor.set(hex, entry);
    }
    const best = [...byColor.entries()].sort((a, b) => b[1].chars - a[1].chars)[0];
    if (best) {
      roles.push({
        role: "heading text",
        kind: "color",
        value: best[0],
        confidence: byColor.size === 1 ? "high" : "medium",
        basis: "Colour of most heading (h1–h3) text.",
        evidence: best[1].evidence,
      });
    }
  }

  const textColors = colors
    .filter((c) => (c.properties.color ?? 0) > 0)
    .sort((a, b) => b.textChars - a.textChars);
  const totalText = textColors.reduce((n, c) => n + c.textChars, 0);
  if (textColors[0] && totalText > 0) {
    const share = textColors[0].textChars / totalText;
    roles.push({
      role: "primary text",
      kind: "color",
      value: textColors[0].hex,
      confidence: share > 0.5 ? "high" : share > 0.25 ? "medium" : "low",
      basis: `Colour of ${Math.round(share * 100)}% of measured text characters.`,
      evidence: textColors[0].samples,
    });
    if (textColors[1] && textColors[1].textChars / totalText > 0.08) {
      roles.push({
        role: "secondary text",
        kind: "color",
        value: textColors[1].hex,
        confidence: "low",
        basis: `Second most used text colour (${Math.round((textColors[1].textChars / totalText) * 100)}% of text).`,
        evidence: textColors[1].samples,
      });
    }
  }

  const surfaces = colors
    .filter((c) => (c.properties["background-color"] ?? 0) > 0 && c.alpha === 1)
    .sort((a, b) => b.backgroundArea - a.backgroundArea);
  const pageBg = roles.find((r) => r.role === "page background")?.value;
  const surface = surfaces.find((c) => c.hex !== pageBg);
  if (surface && surface.backgroundArea > 0) {
    roles.push({
      role: "surface",
      kind: "color",
      value: surface.hex,
      confidence: "low",
      basis: "Opaque background covering the largest rendered area apart from the page background.",
      evidence: surface.samples,
    });
  }

  // Accent: most frequent background on button-like elements.
  if (desktop) {
    const counts = new Map<string, { n: number; evidence: ElementRef[] }>();
    for (const el of desktop.raw.elements) {
      if (!visibleStyled(el)) continue;
      const isButton =
        BUTTONISH.has(el.tag) ||
        el.role === "button" ||
        (el.tag === "a" &&
          el.s.bg !== "rgba(0, 0, 0, 0)" &&
          (px(el.s.pad.split(" ")[1]) ?? 0) >= 8);
      if (!isButton) continue;
      const c = parseColor(el.s.bg);
      if (!c || c.a === 0) continue;
      const hex = toHex(c);
      if (hex === pageBg) continue;
      const entry = counts.get(hex) ?? { n: 0, evidence: [] };
      entry.n += 1;
      if (entry.evidence.length < MAX_SAMPLES) entry.evidence.push(ref(el, desktop.id));
      counts.set(hex, entry);
    }
    const best = [...counts.entries()].sort((a, b) => b[1].n - a[1].n)[0];
    if (best) {
      roles.push({
        role: "accent / primary action",
        kind: "color",
        value: best[0],
        confidence: best[1].n >= 3 ? "medium" : "low",
        basis: `Background of ${best[1].n} button-like element(s).`,
        evidence: best[1].evidence,
      });
    }
  }

  const headingStyles = styles.filter((s) => Object.keys(s.tags).some((t) => /^h[1-3]$/.test(t)));
  if (headingStyles[0]) {
    roles.push({
      role: "heading font",
      kind: "font",
      value: headingStyles[0].fontFamily,
      confidence: "medium",
      basis: "Font family of the most-used h1–h3 text style.",
      evidence: headingStyles[0].samples,
    });
  }
  const bodyStyle = styles.find((s) =>
    Object.keys(s.tags).some((t) => t === "p" || t === "li" || t === "span"),
  );
  if (bodyStyle) {
    roles.push({
      role: "body text style",
      kind: "font",
      value: `${bodyStyle.fontFamily} ${bodyStyle.fontSize}/${bodyStyle.lineHeight} ${bodyStyle.fontWeight}`,
      confidence: "medium",
      basis: "Text style covering the most characters in paragraphs, list items or spans.",
      evidence: bodyStyle.samples,
    });
  }
  return roles;
}
