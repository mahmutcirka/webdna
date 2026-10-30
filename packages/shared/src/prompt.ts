import type { ComponentPattern, OutlineSection, Report, TypeStyle } from "./schemas/report";

/**
 * Builds a detailed, tool-agnostic prompt that asks an AI coding assistant to build a
 * page with the same *design language, layout and responsive behaviour* as an analysed
 * site — from measured values only — while forbidding the copying of brand names,
 * logos, text or images. Deterministic: no AI model is called.
 */
export const PROMPT_STACKS = ["html", "react-tailwind", "nextjs-tailwind"] as const;
export type PromptStack = (typeof PROMPT_STACKS)[number];
export type PromptLanguage = "en" | "tr";

export interface RebuildPromptOptions {
  stack: PromptStack;
  language: PromptLanguage;
}

type Dict = typeof EN;

const EN = {
  title: (pageType: string) => `# Build brief: ${pageType} reproducing a measured design system`,
  pageType: {
    landing: "a responsive marketing landing page",
    content: "a responsive content page",
    app: "a responsive web page",
  },
  character: (s: Character) =>
    `**Design character (derived from measurements):** ${s.headingFont} headings and ${s.bodyFont} body text on a ${s.background} background, ${s.accent ? `a ${s.accent} accent colour, ` : ""}${s.corners} corners${s.surfaces ? ` with ${s.surfaces}` : ""}, and ${s.density} vertical spacing${s.sections ? ` across ${s.sections} sections` : ""}. Aim for the same overall feel.`,
  vocab: {
    serif: "serif",
    sans: "sans-serif",
    mono: "monospace",
    light: "light",
    dark: "dark",
    warm: "warm",
    cool: "cool",
    neutral: "neutral",
    sharp: "sharp",
    soft: "softly rounded",
    rounded: "rounded",
    pill: "pill-shaped",
    hairline: "hairline borders",
    subtleShadow: "subtle shadows",
    strongShadow: "pronounced shadows",
    and: "and",
    airy: "generous, airy",
    balanced: "balanced",
    compact: "compact",
    hues: {
      gray: "grey",
      red: "red",
      orange: "orange",
      yellow: "yellow",
      green: "green",
      teal: "teal",
      blue: "blue",
      purple: "purple",
      pink: "pink",
    } as Record<Hue, string>,
    deep: "deep",
    bright: "bright",
    muted: "muted",
  },
  themeTitle: "Tailwind CSS v4 theme (paste into your global stylesheet):",
  intro:
    "You are a senior product designer and front-end engineer. Build a production-quality page that reproduces the **design language, layout rhythm, component system and responsive behaviour** described below. Every value in this brief was **measured from a real, rendered website** (computed CSS at 1440 / 768 / 390 px), so treat the numbers as the spec — do not round them to framework defaults unless told to.",
  originalityTitle: "## 1. Originality rules (non-negotiable)",
  originality: [
    "Use the reference only for **structure, proportions, spacing, colour and typography decisions**. Do not try to recreate the original website itself.",
    "Invent an original brand: use the placeholder name **[Brand]** everywhere and keep it easy to replace.",
    "Do **not** copy or recreate the reference's logo, trademarks, product names, slogans, copy, images, illustrations or icons. Write fresh copy of similar length and use neutral placeholder imagery (CSS gradients, simple SVG shapes or clearly marked placeholders).",
    "The result must not be mistakable for the original site or brand (no impersonation, no login or payment forms that pose as another service).",
    "Use only fonts and assets you are licensed to use; if a measured font is not freely available, use the closest open alternative and say which one you chose.",
  ],
  stackTitle: "## 2. Tech stack and deliverables",
  stacks: {
    html: [
      "Plain **HTML5 + modern CSS** (custom properties, flexbox, grid). No frameworks, no build step.",
      "Deliver `index.html`, `styles.css` and, only if needed, a tiny `script.js` (e.g. for the mobile menu).",
      "Put every design token from section 3 in `:root` as CSS custom properties and use them everywhere — no hard-coded colours.",
    ],
    "react-tailwind": [
      "**React 19 + TypeScript + Vite + Tailwind CSS v4** (CSS-first configuration).",
      "Define the tokens from section 3 in an `@theme` block in `src/index.css`; use them through Tailwind utilities (e.g. `bg-surface`, `text-muted`).",
      "One component per section from section 5 (e.g. `Header.tsx`, `Hero.tsx`), plus shared `Button`, `Card` and `Input` components. Deliver every file in full.",
    ],
    "nextjs-tailwind": [
      '**Next.js (App Router) + TypeScript + Tailwind CSS v4**; server components by default, `"use client"` only where interaction needs it (mobile menu).',
      "Tokens from section 3 in an `@theme` block in `app/globals.css`; load fonts with `next/font` when they are available on Google Fonts.",
      "`app/page.tsx` composes one component per section from section 5 in `components/`; shared `Button`, `Card` and `Input` components. Deliver every file in full.",
    ],
  } as Record<PromptStack, string[]>,
  tokensTitle: "## 3. Design tokens (measured)",
  tokensIntro:
    "Names are suggestions for readability; the **values** are what was measured. Roles marked *inferred* are heuristic interpretations of how a colour was used.",
  colorsTitle: "### Colours",
  colorHead: "| Token | Value | Measured use | Role |",
  inferred: "inferred",
  uses: (n: number, props: string) => `${n}× ${props}`,
  cssVarsTitle: "Ready-to-use custom properties:",
  typeTitle: "### Typography",
  fontsLine: (fonts: string) => `Font families (by amount of text): ${fonts}.`,
  typeHead: "| Element | Font | Size | Weight | Line height | Letter spacing |",
  scaleLine: (sizes: string) => `Full measured size scale (px): ${sizes}.`,
  spacingTitle: "### Spacing, radii, shadows",
  spacingBase: (base: number, pct: number) =>
    `Spacing base unit: **${base}px** (${pct}% of measured paddings, margins and gaps are multiples of it).`,
  spacingNoBase: "No consistent base unit was detected; use the measured values below.",
  spacingValues: (v: string) => `Most used spacing values: ${v}.`,
  radii: (v: string) => `Border radii: ${v}.`,
  shadows: (v: string) => `Shadows: ${v}.`,
  none: "none",
  layoutTitle: "## 4. Global layout",
  container: (w: string) =>
    `Content container max-width: **${w}**, centred, with horizontal padding.`,
  breakpoints: (v: string) => `Breakpoints declared in the reference CSS: ${v}.`,
  breakpointsNone:
    "No width breakpoints were found in the inspected CSS; use one breakpoint around 768px.",
  rhythm: (v: string) => `Vertical rhythm — section top padding values measured on desktop: ${v}.`,
  pageBg: (v: string) => `Page background: \`${v}\`.`,
  blueprintTitle: "## 5. Page blueprint (top to bottom)",
  blueprintIntro:
    "Build these sections in this order. Heights are the measured desktop heights; text lengths are word counts of the reference copy — write new copy of about that length.",
  blueprintMissing:
    "_This report predates section blueprints; re-scan the page with WebDNA ≥ report schema 1.1 for a section-by-section plan. Use the component and layout data below._",
  kind: {
    header: "Header / navigation",
    hero: "Hero",
    card_grid: "Card grid",
    media: "Media section",
    form: "Form / call to action",
    footer: "Footer",
    content: "Content section",
  } as Record<OutlineSection["kind"], string>,
  sectionHead: (n: number, label: string, tag: string, h: number) =>
    `### 5.${n} ${label} — \`<${tag}>\`, ~${h}px tall on desktop`,
  layoutLine: (l: string) => `Layout: ${l}.`,
  widthLine: (w: number) => `Content width: up to ~${w}px.`,
  padLine: (p: number) => `Vertical padding: ~${p}px.`,
  bgLine: (b: string) => `Background: \`${b}\`.`,
  bgImage: "Has a background image or gradient — use an original gradient or neutral image.",
  sticky: "Fixed/sticky while scrolling.",
  heading: (lvl: number, px: number, w: string, words: number) =>
    `H${lvl} heading (${px}px, weight ${w}) — ~${words} word${words === 1 ? "" : "s"}`,
  paragraphs: (n: number, words: number) =>
    `${n} paragraph${n === 1 ? "" : "s"} (~${words} words in total)`,
  buttons: (n: number) => `${n} button${n === 1 ? "" : "s"} (see button variants in section 6)`,
  links: (n: number) => `${n} text link${n === 1 ? "" : "s"}`,
  images: (n: number) => `${n} image${n === 1 ? "" : "s"} (use placeholders)`,
  inputs: (n: number) => `${n} input field${n === 1 ? "" : "s"} with visible labels`,
  listItems: (n: number) => `${n} list item${n === 1 ? "" : "s"}`,
  contentLine: "Content:",
  cards: (n: number, d?: number, m?: number) =>
    `Cards: **${n}**, ${d ?? "?"} per row on desktop → ${m ?? "?"} per row on mobile.`,
  cardStyle: (bg: string, r: string, border: boolean, shadow: boolean) =>
    `Card style: background \`${bg}\`, radius \`${r}\`${border ? ", 1px border" : ""}${shadow ? ", subtle shadow" : ""}.`,
  perCard: (h: number, p: number, i: number) =>
    `Each card: ${h} heading(s), ${p} paragraph(s)${i ? `, ${i} image(s)` : ""}.`,
  mobileLine: (l: string, h: number) => `Mobile (390px): ${l}, ~${h}px tall.`,
  mobileHidden: "Mobile (390px): hidden.",
  componentsTitle: "## 6. Components",
  buttonVariant: (s: Record<string, string>, n: number) =>
    `Button (${n}×): background \`${s.background ?? "?"}\`, text \`${s.color ?? "?"}\`, border \`${s.border ?? "none"}\`, radius \`${s.radius ?? "?"}\`, padding \`${s.padding ?? "?"}\`, font size \`${s.fontSize ?? "?"}\`, weight \`${s.fontWeight ?? "?"}\`.`,
  cardComp: (s: Record<string, string>, n: number) =>
    `Card (${n}×): background \`${s.background ?? "?"}\`, radius \`${s.radius ?? "?"}\`, border \`${s.border ?? "none"}\`, shadow \`${s.shadow ?? "none"}\`.`,
  inputComp: (s: Record<string, string>, n: number) =>
    `Input (${n}×): border \`${s.border ?? "?"}\`, radius \`${s.radius ?? "?"}\`, height \`${s.height ?? "?"}\`.`,
  badgeComp: (s: Record<string, string>, n: number) =>
    `Badge (${n}×): background \`${s.background ?? "?"}\`, text \`${s.color ?? "?"}\`, font size \`${s.fontSize ?? "?"}\`, pill-shaped.`,
  states:
    "Give every interactive element hover, focus-visible and active states derived from its colours (e.g. darken backgrounds ~8% on hover) and a visible focus ring using the accent colour.",
  responsiveTitle: "## 7. Responsive behaviour (measured)",
  responsiveIntro: "Reproduce these changes between viewports:",
  responsiveNone: "No significant differences were recorded; keep the layout fluid.",
  dontRepeat: (d: string) => `Do **not** reproduce this reference defect: ${d}`,
  a11yTitle: "## 8. Accessibility (WCAG 2.2 AA)",
  a11yBase: [
    "Semantic landmarks (`header`, `nav`, `main`, `footer`), one `h1`, no skipped heading levels.",
    "Text contrast at least 4.5:1 (3:1 for large text); adjust a measured colour slightly if it fails, and say so.",
    "Keyboard access for everything, visible focus, `prefers-reduced-motion` respected, touch targets ≥ 44×44px on mobile.",
  ],
  a11yFix: "The reference had these problems — make sure your build does not:",
  a11yChecks: {
    "image alternative text":
      'every meaningful image needs descriptive `alt` text (decorative images: `alt=""`)',
    "accessible names for links and buttons": "every link and button needs an accessible name",
    "form control labels": "every form field needs a real `<label>` (placeholders are not labels)",
    "heading structure": "use a single `h1` and a logical heading order",
    "text contrast (solid backgrounds only)": "some text had insufficient contrast",
    "touch target size (mobile)": "some tap targets were smaller than 24×24px on mobile",
    "document language": "set the `lang` attribute on `<html>`",
    "viewport meta": "include a proper viewport meta tag and never disable zoom",
  } as Record<string, string>,
  qualityTitle: "## 9. Quality bar and acceptance checklist",
  quality: [
    "Matches the blueprint's order, proportions and spacing at 1440px, 768px and 390px.",
    "No horizontal scrolling at 320–1440px; long words wrap.",
    "Uses only the tokens from section 3 (no stray colours or font sizes).",
    "Lighthouse ≥ 95 for Accessibility and Best Practices; images are lazy-loaded and sized; no layout shift.",
    "No lorem ipsum, no TODOs, no broken links (`#` only for clearly marked demo links).",
    "All copy and imagery are original; nothing identifies the reference brand.",
  ],
  outputTitle: "## 10. Output format",
  output: [
    "First, a short plan (component list and token mapping).",
    "Then **every file in full**, each in its own fenced code block with its path as the title.",
    "Finally, list any assumption you made (e.g. substituted fonts, adjusted contrast).",
  ],
  screenshots:
    "If you can view images and the user attached WebDNA screenshots of the reference, use them only to confirm proportions and layout — not to copy content or branding.",
  footer: (date: string, schema: string) =>
    `_Generated by WebDNA from measurements taken on ${date} (report schema ${schema}). Values are measurements of a rendered page, not the original source code._`,
};

const TR: Dict = {
  title: (pageType) => `# Proje özeti: ölçülmüş bir tasarım sistemini yeniden üreten ${pageType}`,
  pageType: {
    landing: "duyarlı bir tanıtım (landing) sayfası",
    content: "duyarlı bir içerik sayfası",
    app: "duyarlı bir web sayfası",
  },
  character: (s) =>
    `**Tasarım karakteri (ölçümlerden çıkarıldı):** ${s.background} bir zemin üzerinde ${s.headingFont} başlıklar ve ${s.bodyFont} gövde metni, ${s.accent ? `${s.accent} bir vurgu rengi, ` : ""}${s.corners} köşeler${s.surfaces ? `, ${s.surfaces}` : ""}, ${s.density} dikey boşluklar${s.sections ? ` (${s.sections} bölüm)` : ""}. Aynı genel hissi yakala.`,
  vocab: {
    serif: "serif",
    sans: "sans-serif",
    mono: "eş aralıklı (monospace)",
    light: "açık",
    dark: "koyu",
    warm: "sıcak tonlu",
    cool: "soğuk tonlu",
    neutral: "nötr",
    sharp: "keskin",
    soft: "hafif yuvarlatılmış",
    rounded: "yuvarlatılmış",
    pill: "hap biçimli",
    hairline: "ince kenarlıklar",
    subtleShadow: "hafif gölgeler",
    strongShadow: "belirgin gölgeler",
    and: "ve",
    airy: "cömert, ferah",
    balanced: "dengeli",
    compact: "sıkışık",
    hues: {
      gray: "gri",
      red: "kırmızı",
      orange: "turuncu",
      yellow: "sarı",
      green: "yeşil",
      teal: "camgöbeği",
      blue: "mavi",
      purple: "mor",
      pink: "pembe",
    },
    deep: "koyu",
    bright: "canlı",
    muted: "soluk",
  },
  themeTitle: "Tailwind CSS v4 teması (genel stil dosyana yapıştır):",
  intro:
    "Kıdemli bir ürün tasarımcısı ve ön yüz mühendisisin. Aşağıda tarif edilen **tasarım dilini, yerleşim ritmini, bileşen sistemini ve duyarlı davranışı** yeniden üreten, üretime hazır bir sayfa geliştir. Bu özetteki her değer **gerçek, işlenmiş bir web sitesinden ölçülmüştür** (1440 / 768 / 390 px'te hesaplanmış CSS); bu yüzden sayıları şartname olarak kabul et — açıkça söylenmedikçe framework varsayılanlarına yuvarlama.",
  originalityTitle: "## 1. Özgünlük kuralları (tartışmaya kapalı)",
  originality: [
    "Referansı yalnızca **yapı, oranlar, boşluk, renk ve tipografi kararları** için kullan. Orijinal web sitesinin kendisini yeniden yaratmaya çalışma.",
    "Özgün bir marka uydur: her yerde **[Marka]** yer tutucu adını kullan ve kolayca değiştirilebilir tut.",
    "Referansın logosunu, ticari markalarını, ürün adlarını, sloganlarını, metinlerini, görsellerini, illüstrasyonlarını veya ikonlarını **kopyalama ya da yeniden çizme**. Benzer uzunlukta yeni metinler yaz; görseller için nötr yer tutucular kullan (CSS gradyanları, basit SVG şekiller veya açıkça işaretlenmiş yer tutucular).",
    "Sonuç, orijinal site veya markayla karıştırılabilecek nitelikte olmamalı (taklit yok; başka bir hizmetmiş gibi davranan giriş veya ödeme formu yok).",
    "Yalnızca kullanım lisansın olan yazı tiplerini ve varlıkları kullan; ölçülen bir yazı tipi ücretsiz değilse en yakın açık alternatifi kullan ve hangisini seçtiğini belirt.",
  ],
  stackTitle: "## 2. Teknoloji ve teslim edilecekler",
  stacks: {
    html: [
      "Yalın **HTML5 + modern CSS** (custom properties, flexbox, grid). Framework yok, derleme adımı yok.",
      "`index.html`, `styles.css` ve yalnızca gerekirse küçük bir `script.js` (ör. mobil menü için) teslim et.",
      "Bölüm 3'teki tüm tasarım token'larını `:root` içinde CSS custom property olarak tanımla ve her yerde onları kullan — sabit kodlanmış renk yok.",
    ],
    "react-tailwind": [
      "**React 19 + TypeScript + Vite + Tailwind CSS v4** (CSS öncelikli yapılandırma).",
      "Bölüm 3'teki token'ları `src/index.css` içinde bir `@theme` bloğunda tanımla; Tailwind yardımcı sınıflarıyla kullan (ör. `bg-surface`, `text-muted`).",
      "Bölüm 5'teki her bölüm için bir bileşen (ör. `Header.tsx`, `Hero.tsx`) ve ortak `Button`, `Card`, `Input` bileşenleri. Her dosyayı eksiksiz teslim et.",
    ],
    "nextjs-tailwind": [
      '**Next.js (App Router) + TypeScript + Tailwind CSS v4**; varsayılan olarak sunucu bileşenleri, yalnızca etkileşim gereken yerlerde `"use client"` (mobil menü).',
      "Bölüm 3'teki token'lar `app/globals.css` içinde bir `@theme` bloğunda; yazı tipleri Google Fonts'ta varsa `next/font` ile yüklensin.",
      "`app/page.tsx`, `components/` altındaki bölüm bileşenlerini (Bölüm 5) sırayla birleştirsin; ortak `Button`, `Card`, `Input` bileşenleri. Her dosyayı eksiksiz teslim et.",
    ],
  },
  tokensTitle: "## 3. Tasarım token'ları (ölçülmüş)",
  tokensIntro:
    "Adlar okunabilirlik için öneridir; **değerler** ölçülendir. *Çıkarım* olarak işaretli roller, bir rengin nasıl kullanıldığına dair sezgisel yorumlardır.",
  colorsTitle: "### Renkler",
  colorHead: "| Token | Değer | Ölçülen kullanım | Rol |",
  inferred: "çıkarım",
  uses: (n, props) => `${n}× ${props}`,
  cssVarsTitle: "Kullanıma hazır custom property'ler:",
  typeTitle: "### Tipografi",
  fontsLine: (fonts) => `Yazı tipi aileleri (metin miktarına göre): ${fonts}.`,
  typeHead: "| Öğe | Yazı tipi | Boyut | Kalınlık | Satır yüksekliği | Harf aralığı |",
  scaleLine: (sizes) => `Ölçülen tam boyut ölçeği (px): ${sizes}.`,
  spacingTitle: "### Boşluklar, köşe yarıçapları, gölgeler",
  spacingBase: (base, pct) =>
    `Boşluk temel birimi: **${base}px** (ölçülen padding, margin ve gap değerlerinin %${pct}'i bunun katları).`,
  spacingNoBase: "Tutarlı bir temel birim tespit edilmedi; aşağıdaki ölçülen değerleri kullan.",
  spacingValues: (v) => `En çok kullanılan boşluk değerleri: ${v}.`,
  radii: (v) => `Köşe yarıçapları: ${v}.`,
  shadows: (v) => `Gölgeler: ${v}.`,
  none: "yok",
  layoutTitle: "## 4. Genel yerleşim",
  container: (w) => `İçerik kapsayıcısı azami genişliği: **${w}**, ortalanmış, yatay iç boşluklu.`,
  breakpoints: (v) => `Referans CSS'inde tanımlı kırılma noktaları: ${v}.`,
  breakpointsNone:
    "İncelenen CSS'te genişlik kırılma noktası bulunamadı; 768px civarında tek bir kırılma noktası kullan.",
  rhythm: (v) => `Dikey ritim — masaüstünde ölçülen bölüm üst iç boşlukları: ${v}.`,
  pageBg: (v) => `Sayfa arka planı: \`${v}\`.`,
  blueprintTitle: "## 5. Sayfa planı (yukarıdan aşağıya)",
  blueprintIntro:
    "Bu bölümleri bu sırayla oluştur. Yükseklikler ölçülen masaüstü yükseklikleridir; metin uzunlukları referans metnin kelime sayılarıdır — yaklaşık bu uzunlukta yeni metin yaz.",
  blueprintMissing:
    "_Bu rapor bölüm planlarından önce oluşturulmuş; bölüm bölüm plan için sayfayı WebDNA ile yeniden tara (rapor şeması 1.1+). Aşağıdaki bileşen ve yerleşim verilerini kullan._",
  kind: {
    header: "Üst bilgi / gezinme",
    hero: "Hero",
    card_grid: "Kart ızgarası",
    media: "Görsel bölümü",
    form: "Form / eylem çağrısı",
    footer: "Alt bilgi",
    content: "İçerik bölümü",
  },
  sectionHead: (n, label, tag, h) =>
    `### 5.${n} ${label} — \`<${tag}>\`, masaüstünde ~${h}px yüksekliğinde`,
  layoutLine: (l) => `Yerleşim: ${l}.`,
  widthLine: (w) => `İçerik genişliği: ~${w}px'e kadar.`,
  padLine: (p) => `Dikey iç boşluk: ~${p}px.`,
  bgLine: (b) => `Arka plan: \`${b}\`.`,
  bgImage: "Arka plan görseli veya gradyanı var — özgün bir gradyan ya da nötr görsel kullan.",
  sticky: "Kaydırırken sabit/yapışkan (fixed/sticky).",
  heading: (lvl, px, w, words) => `H${lvl} başlık (${px}px, kalınlık ${w}) — ~${words} kelime`,
  paragraphs: (n, words) => `${n} paragraf (toplam ~${words} kelime)`,
  buttons: (n) => `${n} düğme (düğme varyantları için Bölüm 6'ya bak)`,
  links: (n) => `${n} metin bağlantısı`,
  images: (n) => `${n} görsel (yer tutucu kullan)`,
  inputs: (n) => `${n} giriş alanı, görünür etiketlerle`,
  listItems: (n) => `${n} liste öğesi`,
  contentLine: "İçerik:",
  cards: (n, d, m) =>
    `Kartlar: **${n}** adet, masaüstünde satır başına ${d ?? "?"} → mobilde satır başına ${m ?? "?"}.`,
  cardStyle: (bg, r, border, shadow) =>
    `Kart stili: arka plan \`${bg}\`, yarıçap \`${r}\`${border ? ", 1px kenarlık" : ""}${shadow ? ", hafif gölge" : ""}.`,
  perCard: (h, p, i) => `Her kart: ${h} başlık, ${p} paragraf${i ? `, ${i} görsel` : ""}.`,
  mobileLine: (l, h) => `Mobil (390px): ${l}, ~${h}px yüksekliğinde.`,
  mobileHidden: "Mobil (390px): gizli.",
  componentsTitle: "## 6. Bileşenler",
  buttonVariant: (s, n) =>
    `Düğme (${n}×): arka plan \`${s.background ?? "?"}\`, metin \`${s.color ?? "?"}\`, kenarlık \`${s.border ?? "yok"}\`, yarıçap \`${s.radius ?? "?"}\`, iç boşluk \`${s.padding ?? "?"}\`, yazı boyutu \`${s.fontSize ?? "?"}\`, kalınlık \`${s.fontWeight ?? "?"}\`.`,
  cardComp: (s, n) =>
    `Kart (${n}×): arka plan \`${s.background ?? "?"}\`, yarıçap \`${s.radius ?? "?"}\`, kenarlık \`${s.border ?? "yok"}\`, gölge \`${s.shadow ?? "yok"}\`.`,
  inputComp: (s, n) =>
    `Giriş alanı (${n}×): kenarlık \`${s.border ?? "?"}\`, yarıçap \`${s.radius ?? "?"}\`, yükseklik \`${s.height ?? "?"}\`.`,
  badgeComp: (s, n) =>
    `Rozet (${n}×): arka plan \`${s.background ?? "?"}\`, metin \`${s.color ?? "?"}\`, yazı boyutu \`${s.fontSize ?? "?"}\`, hap biçiminde.`,
  states:
    "Her etkileşimli öğeye kendi renklerinden türetilmiş hover, focus-visible ve active durumları ver (ör. hover'da arka planı ~%8 koyulaştır) ve vurgu rengiyle görünür bir odak halkası ekle.",
  responsiveTitle: "## 7. Duyarlı davranış (ölçülmüş)",
  responsiveIntro: "Görünüm alanları arasındaki şu değişiklikleri yeniden üret:",
  responsiveNone: "Önemli bir fark kaydedilmedi; yerleşimi akışkan tut.",
  dontRepeat: (d) => `Referanstaki bu kusuru **tekrarlama**: ${d}`,
  a11yTitle: "## 8. Erişilebilirlik (WCAG 2.2 AA)",
  a11yBase: [
    "Anlamsal bölgeler (`header`, `nav`, `main`, `footer`), tek bir `h1`, atlanmamış başlık seviyeleri.",
    "Metin kontrastı en az 4.5:1 (büyük metinde 3:1); ölçülen bir renk yetersizse hafifçe ayarla ve bunu belirt.",
    "Her şeye klavyeyle erişim, görünür odak, `prefers-reduced-motion` desteği, mobilde dokunma hedefleri ≥ 44×44px.",
  ],
  a11yFix: "Referansta şu sorunlar vardı — senin sürümünde olmadığından emin ol:",
  a11yChecks: {
    "image alternative text":
      'anlamlı her görselin açıklayıcı bir `alt` metni olmalı (süs görselleri: `alt=""`)',
    "accessible names for links and buttons":
      "her bağlantı ve düğmenin erişilebilir bir adı olmalı",
    "form control labels":
      "her form alanının gerçek bir `<label>` etiketi olmalı (placeholder etiket değildir)",
    "heading structure": "tek bir `h1` ve mantıklı bir başlık sırası kullan",
    "text contrast (solid backgrounds only)": "bazı metinlerin kontrastı yetersizdi",
    "touch target size (mobile)": "mobilde bazı dokunma hedefleri 24×24px'ten küçüktü",
    "document language": "`<html>` üzerinde `lang` özniteliğini ayarla",
    "viewport meta": "düzgün bir viewport meta etiketi ekle ve yakınlaştırmayı asla kapatma",
  },
  qualityTitle: "## 9. Kalite çıtası ve kabul listesi",
  quality: [
    "1440px, 768px ve 390px'te planın sırası, oranları ve boşluklarıyla uyuşuyor.",
    "320–1440px arasında yatay kaydırma yok; uzun kelimeler satıra sığıyor.",
    "Yalnızca Bölüm 3'teki token'lar kullanılıyor (fazladan renk veya yazı boyutu yok).",
    "Erişilebilirlik ve En İyi Uygulamalar için Lighthouse ≥ 95; görseller tembel yükleniyor ve boyutlandırılmış; düzen kayması yok.",
    "Lorem ipsum yok, TODO yok, bozuk bağlantı yok (`#` yalnızca açıkça işaretlenmiş demo bağlantıları için).",
    "Tüm metin ve görseller özgün; hiçbir şey referans markayı tanımlamıyor.",
  ],
  outputTitle: "## 10. Çıktı biçimi",
  output: [
    "Önce kısa bir plan (bileşen listesi ve token eşleştirmesi).",
    "Ardından **her dosyanın tamamı**, her biri yolunu başlık olarak taşıyan ayrı bir kod bloğunda.",
    "Son olarak yaptığın varsayımları listele (ör. değiştirilen yazı tipleri, ayarlanan kontrast).",
  ],
  screenshots:
    "Görselleri görebiliyorsan ve kullanıcı referansın WebDNA ekran görüntülerini eklediyse, bunları yalnızca oranları ve yerleşimi doğrulamak için kullan — içerik veya marka kopyalamak için değil.",
  footer: (date, schema) =>
    `_WebDNA tarafından ${date} tarihinde yapılan ölçümlerden üretildi (rapor şeması ${schema}). Değerler işlenmiş bir sayfanın ölçümleridir, orijinal kaynak kodu değildir._`,
};

type Hue = "gray" | "red" | "orange" | "yellow" | "green" | "teal" | "blue" | "purple" | "pink";

interface Character {
  headingFont: string;
  bodyFont: string;
  background: string;
  accent?: string;
  corners: string;
  surfaces?: string;
  density: string;
  sections?: number;
}

function hexToRgb(hex: string): { r: number; g: number; b: number; a: number } | undefined {
  const m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(hex.trim());
  if (!m) return undefined;
  const n = parseInt(m[1]!, 16);
  return {
    r: (n >> 16) & 255,
    g: (n >> 8) & 255,
    b: n & 255,
    a: m[2] ? parseInt(m[2], 16) / 255 : 1,
  };
}

function hsl({ r, g, b }: { r: number; g: number; b: number }): {
  h: number;
  s: number;
  l: number;
} {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  h *= 60;
  return { h, s, l };
}

function hueName(h: number, s: number): Hue {
  if (s < 0.12) return "gray";
  if (h < 15 || h >= 345) return "red";
  if (h < 40) return "orange";
  if (h < 65) return "yellow";
  if (h < 160) return "green";
  if (h < 195) return "teal";
  if (h < 255) return "blue";
  if (h < 295) return "purple";
  return "pink";
}

/** Normalise measured colour strings: rgb()/rgba() → hex, fully transparent → "transparent". */
function normColor(value: string | undefined): string | undefined {
  if (!value) return value;
  const v = value.trim();
  const rgb = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+%?))?\s*\)$/i.exec(v);
  if (rgb) {
    const a =
      rgb[4] === undefined
        ? 1
        : rgb[4].endsWith("%")
          ? parseFloat(rgb[4]) / 100
          : parseFloat(rgb[4]);
    if (a === 0) return "transparent";
    const hex = `#${[rgb[1], rgb[2], rgb[3]].map((x) => Number(x).toString(16).padStart(2, "0")).join("")}`;
    return a < 1
      ? `${hex}${Math.round(a * 255)
          .toString(16)
          .padStart(2, "0")}`
      : hex;
  }
  if (/^#[0-9a-f]{8}$/i.test(v) && v.toLowerCase().endsWith("00")) return "transparent";
  return v;
}

function fontKind(stack: string | undefined): "serif" | "sans" | "mono" {
  const s = (stack ?? "").toLowerCase();
  if (/mono|courier|consolas|menlo/.test(s)) return "mono";
  if (/sans-serif|system-ui|helvetica|arial|inter|roboto|segoe|ui-sans/.test(s)) return "sans";
  if (/serif|georgia|times|garamond|merriweather|playfair|lora/.test(s)) return "serif";
  return "sans";
}

function radiusPx(value: string | undefined): number | undefined {
  const m = /^(\d+(?:\.\d+)?)px$/.exec(value ?? "");
  return m ? Number(m[1]) : undefined;
}

function shadowStrength(value: string | undefined): "none" | "subtle" | "strong" {
  if (!value || value === "none") return "none";
  const alphas = [...value.matchAll(/rgba?\([^)]*?([\d.]+)\)/g)].map((m) => Number(m[1]));
  const alpha = alphas.length ? Math.max(...alphas.filter((a) => a <= 1)) : 0.2;
  return alpha <= 0.15 ? "subtle" : "strong";
}

function describeCharacter(report: Report, T: Dict): string {
  const V = T.vocab;
  const d = report.design;
  const kindWord = (k: "serif" | "sans" | "mono") =>
    k === "serif" ? V.serif : k === "mono" ? V.mono : V.sans;
  const headingFamily = d.roles.find((r) => r.role === "heading font")?.value;
  const headingStack =
    d.typography.families.find((f) => f.family === headingFamily)?.stack ?? headingFamily;
  const bodyStack = d.typography.families[0]?.stack;

  let background = V.light;
  const bg = hexToRgb(d.roles.find((r) => r.role === "page background")?.value ?? "#ffffff");
  if (bg) {
    const { h, s, l } = hsl(bg);
    const tone =
      s < 0.08
        ? V.neutral
        : h >= 20 && h <= 75
          ? V.warm
          : h >= 170 && h <= 260
            ? V.cool
            : V.neutral;
    background = `${tone} ${l > 0.5 ? V.light : V.dark}`;
  }

  let accent: string | undefined;
  const acc = hexToRgb(d.roles.find((r) => r.role === "accent / primary action")?.value ?? "");
  if (acc) {
    const { h, s, l } = hsl(acc);
    const shade = l < 0.35 ? V.deep : s > 0.6 && l >= 0.45 ? V.bright : s < 0.35 ? V.muted : "";
    accent = `${shade ? `${shade} ` : ""}${V.hues[hueName(h, s)]}`;
  }

  const card = report.components.find((c) => c.kind === "card");
  const r = radiusPx(card?.styles.radius) ?? radiusPx(d.radii[0]?.value);
  const corners =
    r === undefined || r < 4 ? V.sharp : r >= 999 ? V.pill : r <= 10 ? V.soft : V.rounded;
  const extras: string[] = [];
  if (card?.styles.border && !card.styles.border.startsWith("0px")) extras.push(V.hairline);
  const shadow = shadowStrength(card?.styles.shadow ?? d.shadows[0]?.value);
  if (shadow !== "none") extras.push(shadow === "subtle" ? V.subtleShadow : V.strongShadow);

  const pads = (report.outline ?? []).map((s) => s.desktop.paddingY ?? 0);
  const maxPad = pads.length ? Math.max(...pads) : (d.spacingBase?.basePx ?? 8) * 6;
  const density = maxPad >= 80 ? V.airy : maxPad >= 40 ? V.balanced : V.compact;

  return T.character({
    headingFont: kindWord(fontKind(headingStack)),
    bodyFont: kindWord(fontKind(bodyStack)),
    background,
    accent,
    corners,
    surfaces: extras.length ? extras.join(` ${V.and} `) : undefined,
    density,
    sections: report.outline?.length,
  });
}

const ROLE_TOKEN: Record<string, string> = {
  "page background": "--color-bg",
  "heading text": "--color-heading",
  "primary text": "--color-text",
  "secondary text": "--color-text-muted",
  surface: "--color-surface",
  "accent / primary action": "--color-accent",
};

function list(items: string[]): string[] {
  return items.map((i) => `- ${i}`);
}

function pickStyle(styles: TypeStyle[], tags: string[]): TypeStyle | undefined {
  let best: TypeStyle | undefined;
  let bestCount = 0;
  for (const s of styles) {
    const n = tags.reduce((sum, t) => sum + (s.tags[t] ?? 0), 0);
    if (n > bestCount) {
      best = s;
      bestCount = n;
    }
  }
  return best;
}

function pageTypeKey(outline: OutlineSection[] | undefined): keyof Dict["pageType"] {
  if (!outline?.length) return "app";
  if (outline.some((s) => s.kind === "hero")) return "landing";
  return "content";
}

function colorTokens(report: Report): { name: string; hex: string; role?: string; uses: string }[] {
  const roleByValue = new Map<string, string>();
  for (const r of report.design.roles) {
    if (r.kind === "color" && !roleByValue.has(r.value)) roleByValue.set(r.value, r.role);
  }
  const used = new Set<string>();
  let n = 0;
  return report.design.colors.slice(0, 16).map((c) => {
    const role = roleByValue.get(c.hex);
    let name = role ? ROLE_TOKEN[role] : undefined;
    if (!name || used.has(name)) name = `--color-${++n}`;
    used.add(name);
    const props = Object.entries(c.properties)
      .sort((a, b) => b[1] - a[1])
      .map(([p]) => p.replace("background-color", "background").replace("border-color", "border"))
      .join(", ");
    return { name, hex: c.hex, role, uses: `${c.count}× ${props}` };
  });
}

function componentLines(T: Dict, components: ComponentPattern[]): string[] {
  const out: string[] = [];
  const norm = (styles: Record<string, string>): Record<string, string> => {
    const out: Record<string, string> = { ...styles };
    if (styles.background) out.background = normColor(styles.background)!;
    if (styles.color) out.color = normColor(styles.color)!;
    if (styles.border) out.border = styles.border.replace(/#[0-9a-f]{6}00\b/gi, "transparent");
    return out;
  };
  const top = (kind: ComponentPattern["kind"], n: number) =>
    components.filter((c) => c.kind === kind).slice(0, n);
  for (const b of top("button", 3)) out.push(T.buttonVariant(norm(b.styles), b.count));
  for (const c of top("card", 1)) out.push(T.cardComp(norm(c.styles), c.count));
  for (const i of top("input", 1)) out.push(T.inputComp(i.styles, i.count));
  for (const b of top("badge", 1)) out.push(T.badgeComp(norm(b.styles), b.count));
  return out;
}

function sectionLines(T: Dict, s: OutlineSection, n: number): string[] {
  const out = [T.sectionHead(n, T.kind[s.kind], s.tag, s.desktop.height)];
  const facts: string[] = [T.layoutLine(s.desktop.layout)];
  if (s.desktop.maxContentWidth) facts.push(T.widthLine(s.desktop.maxContentWidth));
  if (s.desktop.paddingY) facts.push(T.padLine(s.desktop.paddingY));
  if (s.desktop.background) facts.push(T.bgLine(s.desktop.background));
  if (s.desktop.backgroundImage) facts.push(T.bgImage);
  if (s.desktop.sticky) facts.push(T.sticky);
  const c = s.content;
  const parts: string[] = [
    ...c.headings.map((h) => T.heading(h.level, h.sizePx, h.weight, h.words)),
  ];
  if (c.paragraphs) parts.push(T.paragraphs(c.paragraphs, c.paragraphWords));
  if (c.buttons) parts.push(T.buttons(c.buttons));
  if (c.links) parts.push(T.links(c.links));
  if (c.images) parts.push(T.images(c.images));
  if (c.inputs) parts.push(T.inputs(c.inputs));
  if (c.listItems) parts.push(T.listItems(c.listItems));
  if (parts.length) facts.push(`${T.contentLine} ${parts.join("; ")}.`);
  if (s.cards) {
    facts.push(T.cards(s.cards.count, s.cards.columnsDesktop, s.cards.columnsMobile));
    facts.push(
      T.cardStyle(
        s.cards.background ?? "transparent",
        s.cards.radius ?? "0px",
        s.cards.border,
        s.cards.shadow,
      ),
    );
    facts.push(
      T.perCard(s.cards.perCard.headings, s.cards.perCard.paragraphs, s.cards.perCard.images),
    );
  }
  if (s.mobile)
    facts.push(s.mobile.visible ? T.mobileLine(s.mobile.layout, s.mobile.height) : T.mobileHidden);
  return [...out, ...list(facts), ""];
}

export function buildRebuildPrompt(report: Report, options: RebuildPromptOptions): string {
  const T: Dict = options.language === "tr" ? TR : EN;
  const d = report.design;
  const L: string[] = [];

  L.push(T.title(T.pageType[pageTypeKey(report.outline)]), "", T.intro, "");
  L.push(describeCharacter(report, T), "");
  L.push(T.originalityTitle, ...list(T.originality), "");
  L.push(T.stackTitle, ...list(T.stacks[options.stack]), "");

  // 3. Tokens
  L.push(T.tokensTitle, "", T.tokensIntro, "", T.colorsTitle, "", T.colorHead, "|---|---|---|---|");
  const colors = colorTokens(report);
  for (const c of colors) {
    L.push(
      `| \`${c.name}\` | \`${c.hex}\` | ${c.uses} | ${c.role ? `${c.role} (${T.inferred})` : ""} |`,
    );
  }
  const tailwind = options.stack !== "html";
  L.push("", tailwind ? T.themeTitle : T.cssVarsTitle, "", "```css");
  L.push(...(tailwind ? ['@import "tailwindcss";', "", "@theme {"] : [":root {"]));
  for (const c of colors) L.push(`  ${c.name}: ${c.hex};`);
  const fonts = d.typography.families.slice(0, 3);
  fonts.forEach((f, i) =>
    L.push(`  --font-${i === 0 ? "sans" : i === 1 ? "alt" : `extra-${i}`}: ${f.stack};`),
  );
  if (d.spacingBase) {
    L.push(
      tailwind
        ? `  --spacing: ${d.spacingBase.basePx / 2}px; /* Tailwind step; base unit ${d.spacingBase.basePx}px = 2 steps */`
        : `  --space-unit: ${d.spacingBase.basePx}px;`,
    );
  }
  d.radii.slice(0, 4).forEach((r, i) => L.push(`  --radius-${i + 1}: ${r.value};`));
  d.shadows.slice(0, 2).forEach((s, i) => L.push(`  --shadow-${i + 1}: ${s.value};`));
  L.push("}", "```", "");

  L.push(
    T.typeTitle,
    "",
    T.fontsLine(fonts.map((f) => `**${f.family}** (\`${f.stack}\`)`).join(", ") || T.none),
    "",
  );
  L.push(T.typeHead, "|---|---|---|---|---|---|");
  const rows: [string, string[]][] = [
    ["h1", ["h1"]],
    ["h2", ["h2"]],
    ["h3", ["h3"]],
    ["body / p", ["p", "li"]],
    ["link", ["a"]],
    ["button", ["button"]],
    ["small", ["small", "span"]],
  ];
  for (const [label, tags] of rows) {
    const s = pickStyle(d.typography.styles, tags);
    if (s) {
      L.push(
        `| ${label} | ${s.fontFamily} | ${s.fontSize} | ${s.fontWeight} | ${s.lineHeight} | ${s.letterSpacing} |`,
      );
    }
  }
  L.push("", T.scaleLine(d.typography.sizeScalePx.join(", ") || T.none), "");

  L.push(T.spacingTitle, "");
  L.push(
    d.spacingBase
      ? T.spacingBase(d.spacingBase.basePx, Math.round(d.spacingBase.share * 100))
      : T.spacingNoBase,
  );
  const spacing = [...d.spacing]
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map((s) => s.value)
    .sort((a, b) => parseFloat(a) - parseFloat(b));
  L.push(T.spacingValues(spacing.join(", ") || T.none));
  L.push(
    T.radii(
      d.radii
        .slice(0, 6)
        .map((r) => `\`${r.value}\``)
        .join(", ") || T.none,
    ),
  );
  L.push(
    T.shadows(
      d.shadows
        .slice(0, 3)
        .map((s) => `\`${s.value}\``)
        .join("; ") || T.none,
    ),
    "",
  );

  // 4. Global layout
  L.push(T.layoutTitle, "");
  const layoutFacts: string[] = [];
  const container = report.layout.containerWidths[0]?.value;
  if (container) layoutFacts.push(T.container(container));
  layoutFacts.push(
    report.responsive.breakpointsDeclared.length
      ? T.breakpoints(report.responsive.breakpointsDeclared.map((b) => `${b}px`).join(", "))
      : T.breakpointsNone,
  );
  const paddings = [
    ...new Set(
      (report.outline ?? []).map((s) => s.desktop.paddingY).filter((p): p is number => !!p),
    ),
  ];
  if (paddings.length) layoutFacts.push(T.rhythm(paddings.map((p) => `${p}px`).join(", ")));
  const pageBg = d.roles.find((r) => r.role === "page background")?.value;
  if (pageBg) layoutFacts.push(T.pageBg(pageBg));
  L.push(...list(layoutFacts), "");

  // 5. Blueprint
  L.push(T.blueprintTitle, "");
  if (report.outline?.length) {
    L.push(T.blueprintIntro, "");
    report.outline.forEach((s, i) => L.push(...sectionLines(T, s, i + 1)));
  } else {
    L.push(T.blueprintMissing, "");
  }

  // 6. Components
  L.push(T.componentsTitle, "", ...list([...componentLines(T, report.components), T.states]), "");

  // 7. Responsive
  L.push(T.responsiveTitle, "");
  const changes = report.responsive.changes.filter(
    (c) => c.kind !== "geometry" && c.severity === "informational",
  );
  const seen = new Set<string>();
  const responsive: string[] = [];
  for (const c of changes) {
    const line = `${c.from} → ${c.to}: ${c.description}`;
    if (!seen.has(c.description) && responsive.length < 12) {
      seen.add(c.description);
      responsive.push(line);
    }
  }
  const defects = report.responsive.changes
    .filter((c) => c.severity === "potential_issue")
    .slice(0, 3);
  if (responsive.length || defects.length) {
    L.push(
      T.responsiveIntro,
      ...list([...responsive, ...defects.map((c) => T.dontRepeat(`${c.to}: ${c.description}`))]),
      "",
    );
  } else L.push(T.responsiveNone, "");

  // 8. Accessibility
  L.push(T.a11yTitle, "", ...list(T.a11yBase));
  const checks = [...new Set(report.accessibility.issues.map((i) => i.check))];
  const fixes = checks.map((c) => T.a11yChecks[c]).filter((x): x is string => !!x);
  if (fixes.length) L.push("", T.a11yFix, ...list(fixes));
  L.push("");

  // 9–10
  L.push(T.qualityTitle, "", ...T.quality.map((q) => `- [ ] ${q}`), "");
  L.push(
    T.outputTitle,
    "",
    ...T.output.map((o, i) => `${i + 1}. ${o}`),
    "",
    `> ${T.screenshots}`,
    "",
  );
  L.push(T.footer(report.createdAt.slice(0, 10), report.schemaVersion));
  return `${L.join("\n")}\n`;
}
