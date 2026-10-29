export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function num(token: string | undefined, percentScale = 1): number {
  if (!token || token === "none") return 0;
  if (token.endsWith("%")) return (parseFloat(token) / 100) * percentScale;
  if (token.endsWith("deg")) return parseFloat(token);
  if (token.endsWith("turn")) return parseFloat(token) * 360;
  if (token.endsWith("rad")) return (parseFloat(token) * 180) / Math.PI;
  return parseFloat(token);
}

function splitArgs(inner: string, legacyAlpha = true): { parts: string[]; alpha?: string } {
  const [main, alpha] = inner.split("/").map((s) => s.trim());
  const parts = main!.includes(",") ? main!.split(",").map((s) => s.trim()) : main!.split(/\s+/);
  if (legacyAlpha && alpha === undefined && parts.length === 4)
    return { parts: parts.slice(0, 3), alpha: parts[3] };
  return { parts, alpha };
}

function alphaOf(token: string | undefined): number {
  if (token === undefined) return 1;
  return clamp01(num(token));
}

const srgbEncode = (c: number) =>
  c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
const srgbDecode = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

function mul(m: number[][], v: number[]): number[] {
  return m.map((row) => row[0]! * v[0]! + row[1]! * v[1]! + row[2]! * v[2]!);
}

const XYZ_D65_TO_LINEAR_SRGB = [
  [3.2409699419045226, -1.537383177570094, -0.4986107602930034],
  [-0.9692436362808796, 1.8759675015077202, 0.04155505740717559],
  [0.05563007969699366, -0.20397695888897652, 1.0569715142428786],
];
const D50_TO_D65 = [
  [0.9554734527042182, -0.023098536874261423, 0.0632593086610217],
  [-0.028369706963208136, 1.0099954580058226, 0.021041398966943008],
  [0.012314001688319899, -0.020507696433477912, 1.3303659366080753],
];
const LINEAR_P3_TO_XYZ = [
  [0.4865709486482162, 0.26566769316909306, 0.1982172852343625],
  [0.2289745640697488, 0.6917385218365064, 0.079286914093745],
  [0, 0.04511338185890264, 1.043944368900976],
];

function fromLinear(rgb: number[], a: number): Rgba {
  return {
    r: Math.round(clamp01(srgbEncode(rgb[0]!)) * 255),
    g: Math.round(clamp01(srgbEncode(rgb[1]!)) * 255),
    b: Math.round(clamp01(srgbEncode(rgb[2]!)) * 255),
    a,
  };
}

function oklabToRgba(L: number, A: number, B: number, a: number): Rgba {
  const l_ = L + 0.3963377774 * A + 0.2158037573 * B;
  const m_ = L - 0.1055613458 * A - 0.0638541728 * B;
  const s_ = L - 0.0894841775 * A - 1.291485548 * B;
  const l = l_ ** 3,
    m = m_ ** 3,
    s = s_ ** 3;
  return fromLinear(
    [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ],
    a,
  );
}

function labToRgba(L: number, A: number, B: number, a: number): Rgba {
  const eps = 216 / 24389,
    kappa = 24389 / 27;
  const fy = (L + 16) / 116,
    fx = fy + A / 500,
    fz = fy - B / 200;
  const xr = fx ** 3 > eps ? fx ** 3 : (116 * fx - 16) / kappa;
  const yr = L > kappa * eps ? ((L + 16) / 116) ** 3 : L / kappa;
  const zr = fz ** 3 > eps ? fz ** 3 : (116 * fz - 16) / kappa;
  const xyzD50 = [xr * 0.96422, yr, zr * 0.82521];
  return fromLinear(mul(XYZ_D65_TO_LINEAR_SRGB, mul(D50_TO_D65, xyzD50)), a);
}

/**
 * Parse a computed CSS colour (Chromium serialisations: rgb/rgba, color(srgb|display-p3),
 * oklch, oklab, lab, lch, hsl, hex, transparent) into 8-bit sRGB.
 */
export function parseColor(input: string): Rgba | null {
  const value = input.trim().toLowerCase();
  if (value === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  if (value.startsWith("#")) {
    const hex = value.slice(1);
    const full = hex.length <= 4 ? [...hex].map((c) => c + c).join("") : hex;
    if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/.test(full)) return null;
    return {
      r: parseInt(full.slice(0, 2), 16),
      g: parseInt(full.slice(2, 4), 16),
      b: parseInt(full.slice(4, 6), 16),
      a: full.length === 8 ? parseInt(full.slice(6, 8), 16) / 255 : 1,
    };
  }
  const m = /^([a-z-]+)\((.*)\)$/.exec(value);
  if (!m) return null;
  const fn = m[1]!;
  const inner = m[2]!;
  switch (fn) {
    case "rgb":
    case "rgba": {
      const { parts, alpha } = splitArgs(inner);
      const ch = parts.map((p) => (p.endsWith("%") ? (parseFloat(p) / 100) * 255 : parseFloat(p)));
      if (ch.length < 3 || ch.some((c) => Number.isNaN(c))) return null;
      return {
        r: Math.round(ch[0]!),
        g: Math.round(ch[1]!),
        b: Math.round(ch[2]!),
        a: alphaOf(alpha),
      };
    }
    case "hsl":
    case "hsla": {
      const { parts, alpha } = splitArgs(inner);
      const h = num(parts[0]) / 360,
        s = num(parts[1], 1),
        l = num(parts[2], 1);
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      const hue = (t: number) => {
        t = (t + 1) % 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };
      return {
        r: Math.round(hue(h + 1 / 3) * 255),
        g: Math.round(hue(h) * 255),
        b: Math.round(hue(h - 1 / 3) * 255),
        a: alphaOf(alpha),
      };
    }
    case "color": {
      const { parts, alpha } = splitArgs(inner, false);
      const space = parts[0];
      const ch = parts.slice(1, 4).map((p) => num(p, 1));
      if (space === "srgb") return fromLinear(ch.map(srgbDecode), alphaOf(alpha));
      if (space === "srgb-linear") return fromLinear(ch, alphaOf(alpha));
      if (space === "display-p3") {
        return fromLinear(
          mul(XYZ_D65_TO_LINEAR_SRGB, mul(LINEAR_P3_TO_XYZ, ch.map(srgbDecode))),
          alphaOf(alpha),
        );
      }
      return null;
    }
    case "oklab": {
      const { parts, alpha } = splitArgs(inner);
      return oklabToRgba(num(parts[0], 1), num(parts[1], 0.4), num(parts[2], 0.4), alphaOf(alpha));
    }
    case "oklch": {
      const { parts, alpha } = splitArgs(inner);
      const L = num(parts[0], 1),
        C = num(parts[1], 0.4),
        h = (num(parts[2]) * Math.PI) / 180;
      return oklabToRgba(L, C * Math.cos(h), C * Math.sin(h), alphaOf(alpha));
    }
    case "lab": {
      const { parts, alpha } = splitArgs(inner);
      return labToRgba(num(parts[0], 100), num(parts[1], 125), num(parts[2], 125), alphaOf(alpha));
    }
    case "lch": {
      const { parts, alpha } = splitArgs(inner);
      const L = num(parts[0], 100),
        C = num(parts[1], 150),
        h = (num(parts[2]) * Math.PI) / 180;
      return labToRgba(L, C * Math.cos(h), C * Math.sin(h), alphaOf(alpha));
    }
    default:
      return null;
  }
}

export function toHex(c: Rgba): string {
  const h = (n: number) => n.toString(16).padStart(2, "0");
  const base = `#${h(c.r)}${h(c.g)}${h(c.b)}`;
  return c.a < 1 ? `${base}${h(Math.round(c.a * 255))}` : base;
}

export function relativeLuminance(c: Rgba): number {
  const lin = [c.r, c.g, c.b].map((v) => srgbDecode(v / 255));
  return 0.2126 * lin[0]! + 0.7152 * lin[1]! + 0.0722 * lin[2]!;
}

export function contrastRatio(fg: Rgba, bg: Rgba): number {
  const a = relativeLuminance(fg),
    b = relativeLuminance(bg);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/** Composite a (possibly translucent) colour over an opaque background. */
export function composite(top: Rgba, bottom: Rgba): Rgba {
  const a = top.a;
  return {
    r: Math.round(top.r * a + bottom.r * (1 - a)),
    g: Math.round(top.g * a + bottom.g * (1 - a)),
    b: Math.round(top.b * a + bottom.b * (1 - a)),
    a: 1,
  };
}
