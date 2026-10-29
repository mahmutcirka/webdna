import { safeSnippet, type EvidenceRef, type EvidenceStrength } from "@webdna/shared";
import type { EvidenceBundle } from "../evidence.js";
import type { Detector, DetectorResult } from "../types.js";

const REVIEWED = "2026-10-29";

const NOT_AI =
  "Template and placeholder signals indicate reuse or incomplete customisation; they are not evidence of AI involvement.";

function textContext(text: string, index: number, length: number): string {
  return safeSnippet(text.slice(Math.max(0, index - 30), index + length + 30), 120);
}

/** Lorem ipsum and common unreplaced placeholder copy in visible text. */
export const placeholderTextDetector: Detector = {
  id: "template.placeholder-text",
  name: "Placeholder copy",
  version: "1.0.0",
  category: "template_signal",
  description: "Looks for lorem ipsum and common placeholder phrases in the page's visible text.",
  evidenceRequirements: ["visibleText"],
  maxStrength: "moderate",
  limitations: [
    "Only the first part of the visible text is inspected.",
    "Placeholder copy is common in human-built drafts too.",
  ],
  falsePositiveConsiderations: [
    "Design blogs and typography demos legitimately display lorem ipsum.",
    "Articles about placeholder text mention these phrases.",
  ],
  status: "active",
  provenance: {
    type: "documented",
    reference: "Common placeholder conventions",
    lastReviewed: REVIEWED,
  },
  fixtures: {
    positive: ["fixtures/sites/template-default/index.html"],
    negative: ["fixtures/sites/framework-only/index.html"],
  },
  detect(bundle) {
    const text = bundle.visibleText;
    if (!text) return [];
    const patterns: { re: RegExp; label: string; strength: EvidenceStrength }[] = [
      {
        re: /lorem ipsum dolor sit amet/gi,
        label: "Lorem ipsum filler text",
        strength: "moderate",
      },
      {
        re: /\[(your|company|insert) [a-z ]{2,30}\]/gi,
        label: "Bracketed placeholder",
        strength: "moderate",
      },
      {
        re: /\b(your company name|company name here|your name here|your tagline here)\b/gi,
        label: "Placeholder name",
        strength: "moderate",
      },
      {
        re: /\b(email|name|hello|info)@example\.(com|org)\b/gi,
        label: "example.com placeholder address",
        strength: "weak",
      },
      {
        re: /\(555\) ?\d{3}-\d{4}|\b555-\d{3}-\d{4}\b/g,
        label: "555 placeholder phone number",
        strength: "weak",
      },
    ];
    const results: DetectorResult[] = [];
    for (const p of patterns) {
      const matches = [...text.matchAll(p.re)];
      if (matches.length === 0) continue;
      results.push({
        category: "template_signal",
        subject: "Placeholder content",
        subjectType: "content",
        finding: `${p.label} observed (${matches.length}×)`,
        evidenceStrength: p.strength,
        evidenceKind: "direct",
        source: "visible page text",
        explanation: `Visible text contains ${p.label.toLowerCase()}, suggesting content that was not fully customised. ${NOT_AI}`,
        evidence: matches.slice(0, 3).map((m) => ({
          type: "visible_text" as const,
          location: "rendered page text (desktop)",
          value: textContext(text, m.index ?? 0, m[0].length),
          viewport: "desktop" as const,
        })),
        alternativeExplanations: ["Work-in-progress or staging page.", "Intentional demo content."],
        limitations: this.limitations,
      });
    }
    return results;
  },
};

interface StarterSignature {
  id: string;
  template: string;
  where: "visible_text" | "title";
  re: RegExp;
  strength: EvidenceStrength;
}

const STARTERS: StarterSignature[] = [
  {
    id: "cra",
    template: "Create React App starter",
    where: "visible_text",
    re: /Edit src\/App\.(js|tsx?) and save to reload/i,
    strength: "strong",
  },
  {
    id: "next",
    template: "create-next-app starter",
    where: "visible_text",
    re: /Get started by editing\s*(app|pages|src\/app)\/(page|index)\.(js|tsx?)/i,
    strength: "strong",
  },
  {
    id: "vite-react",
    template: "Vite React starter",
    where: "title",
    re: /^Vite \+ React( \+ TS)?$/i,
    strength: "strong",
  },
  {
    id: "vite-vue",
    template: "Vite Vue starter",
    where: "title",
    re: /^Vite \+ Vue( \+ TS)?$/i,
    strength: "strong",
  },
  {
    id: "vite-logos",
    template: "Vite starter",
    where: "visible_text",
    re: /Click on the Vite and (React|Vue|Svelte) logos to learn more/i,
    strength: "strong",
  },
  {
    id: "angular",
    template: "Angular CLI starter",
    where: "visible_text",
    re: /Congratulations! Your app is running\./i,
    strength: "strong",
  },
  {
    id: "wp-tagline",
    template: "WordPress default tagline",
    where: "visible_text",
    re: /Just another WordPress site/i,
    strength: "strong",
  },
  {
    id: "wp-first-post",
    template: "WordPress default first post",
    where: "visible_text",
    re: /Welcome to WordPress\. This is your first post\./i,
    strength: "strong",
  },
  {
    id: "react-app-title",
    template: "Create React App default title",
    where: "title",
    re: /^React App$/i,
    strength: "moderate",
  },
  {
    id: "next-title",
    template: "create-next-app default title",
    where: "title",
    re: /^Create Next App$/i,
    strength: "moderate",
  },
];

/** Unchanged copy from well-known starter templates. */
export const defaultStarterDetector: Detector = {
  id: "template.default-starter-content",
  name: "Unchanged starter-template content",
  version: "1.0.0",
  category: "template_signal",
  description:
    "Matches default copy and titles shipped by popular project starters (CRA, create-next-app, Vite, Angular CLI, WordPress).",
  evidenceRequirements: ["visibleText", "meta"],
  maxStrength: "strong",
  limitations: [
    "Only covers the starters listed in the rule.",
    "Strings change between starter versions.",
  ],
  falsePositiveConsiderations: ["Tutorials that quote starter text."],
  status: "active",
  provenance: {
    type: "documented",
    reference: "Default templates of the respective starter tools",
    lastReviewed: REVIEWED,
  },
  fixtures: {
    positive: ["fixtures/sites/template-default/index.html"],
    negative: ["fixtures/sites/framework-only/index.html"],
  },
  detect(bundle) {
    const title = titleOf(bundle);
    const results: DetectorResult[] = [];
    for (const starter of STARTERS) {
      let ref: EvidenceRef | undefined;
      if (starter.where === "title" && title && starter.re.test(title)) {
        ref = { type: "meta", location: "<title>", value: safeSnippet(title, 120) };
      } else if (starter.where === "visible_text" && bundle.visibleText) {
        const m = starter.re.exec(bundle.visibleText);
        if (m)
          ref = {
            type: "visible_text",
            location: "rendered page text (desktop)",
            value: textContext(bundle.visibleText, m.index, m[0].length),
            viewport: "desktop",
          };
      }
      if (!ref) continue;
      results.push({
        category: "template_signal",
        subject: starter.template,
        subjectType: "starter_template",
        finding: `Default content from the ${starter.template} is still present`,
        evidenceStrength: starter.strength,
        evidenceKind: "direct",
        source: ref.type === "meta" ? "document title" : "visible page text",
        explanation: `The page contains text shipped unchanged by the ${starter.template}. ${NOT_AI}`,
        evidence: [ref],
        alternativeExplanations: [
          "The project is at an early stage.",
          "A deliberate demo of the starter.",
        ],
        limitations: this.limitations,
      });
    }
    return results;
  },
};

/** Unreplaced template variables like {{title}} or %PUBLIC_URL% in visible text or attributes. */
export const unreplacedVariablesDetector: Detector = {
  id: "template.unreplaced-variables",
  name: "Unreplaced template variables",
  version: "1.0.0",
  category: "template_signal",
  description:
    "Finds template interpolation syntax that leaked into rendered text or resource URLs.",
  evidenceRequirements: ["visibleText", "assetUrls"],
  maxStrength: "moderate",
  limitations: ["Pages documenting template languages legitimately show this syntax."],
  falsePositiveConsiderations: [
    "Code samples on documentation pages.",
    "Client-side templates captured before hydration.",
  ],
  status: "active",
  provenance: {
    type: "documented",
    reference: "Handlebars/Mustache/Vue/Jinja/CRA interpolation syntax",
    lastReviewed: REVIEWED,
  },
  fixtures: {
    positive: ["fixtures/sites/template-default/index.html"],
    negative: ["fixtures/sites/framework-only/index.html"],
  },
  detect(bundle) {
    const results: DetectorResult[] = [];
    const text = bundle.visibleText ?? "";
    const textMatches = [
      ...text.matchAll(/\{\{\s*[\w.]{1,40}\s*\}\}|%PUBLIC_URL%|\$\{[\w.]{1,40}\}/g),
    ];
    const urlMatches = bundle.assetUrls.filter((u) => /%PUBLIC_URL%|%7B%7B|\{\{/.test(u));
    if (textMatches.length === 0 && urlMatches.length === 0) return [];
    results.push({
      category: "template_signal",
      subject: "Template variables",
      subjectType: "content",
      finding: `Unreplaced template variables observed (${textMatches.length + urlMatches.length}×)`,
      evidenceStrength: textMatches.length + urlMatches.length >= 2 ? "moderate" : "weak",
      evidenceKind: "direct",
      source: "visible page text and resource URLs",
      explanation: `Interpolation syntax appears in rendered output, suggesting a template value was never filled in. ${NOT_AI}`,
      evidence: [
        ...textMatches.slice(0, 3).map((m) => ({
          type: "visible_text" as const,
          location: "rendered page text (desktop)",
          value: textContext(text, m.index ?? 0, m[0].length),
          viewport: "desktop" as const,
        })),
        ...urlMatches.slice(0, 2).map((u) => ({
          type: "asset_path" as const,
          location: "requested resource",
          value: safeSnippet(u),
        })),
      ],
      alternativeExplanations: [
        "Documentation that shows template syntax.",
        "A rendering error on this particular load.",
      ],
      limitations: this.limitations,
    });
    return results;
  },
};

const DEFAULT_ASSETS: { re: RegExp; label: string }[] = [
  { re: /\/vite\.svg(\?|$)/, label: "Vite starter logo (/vite.svg)" },
  { re: /\/(next|vercel)\.svg(\?|$)/, label: "create-next-app starter image" },
  { re: /\/logo192\.png(\?|$)/, label: "Create React App default icon (/logo192.png)" },
  { re: /\/placeholder(-[a-z]+)?\.(svg|png|jpg)(\?|$)/, label: "Generic placeholder image" },
];

/** Default starter assets (logos, icons, placeholder images) still in use. */
export const defaultAssetsDetector: Detector = {
  id: "template.default-assets",
  name: "Default starter assets",
  version: "1.0.0",
  category: "template_signal",
  description:
    "Finds starter-template logos, favicons and placeholder images that are still referenced.",
  evidenceRequirements: ["assetUrls", "links"],
  maxStrength: "weak",
  limitations: ["File names are easy to reuse intentionally."],
  falsePositiveConsiderations: ["Sites about Vite/Next.js legitimately show their logos."],
  status: "active",
  provenance: {
    type: "documented",
    reference: "Default public/ folders of Vite, create-next-app and CRA",
    lastReviewed: REVIEWED,
  },
  fixtures: {
    positive: ["fixtures/sites/template-default/index.html"],
    negative: ["fixtures/sites/framework-only/index.html"],
  },
  detect(bundle) {
    const urls = [...new Set([...bundle.assetUrls, ...bundle.links.map((l) => l.href)])];
    const results: DetectorResult[] = [];
    for (const asset of DEFAULT_ASSETS) {
      const hits = urls.filter((u) => asset.re.test(safePath(u)));
      if (hits.length === 0) continue;
      results.push({
        category: "template_signal",
        subject: asset.label,
        subjectType: "starter_template",
        finding: `${asset.label} is referenced`,
        evidenceStrength: "weak",
        evidenceKind: "direct",
        source: "resource URLs",
        explanation: `The page references an asset whose path matches a starter default. ${NOT_AI}`,
        evidence: hits.slice(0, 3).map((u) => ({
          type: "asset_path" as const,
          location: "requested resource",
          value: safeSnippet(u),
        })),
        alternativeExplanations: ["The asset was intentionally kept or renamed to the same path."],
        limitations: this.limitations,
      });
    }
    return results;
  },
};

/** A large share of links pointing to "#" suggests unfinished navigation. */
export const placeholderLinksDetector: Detector = {
  id: "template.placeholder-links",
  name: "Placeholder links",
  version: "1.0.0",
  category: "template_signal",
  description: "Reports pages where many anchors point to '#' or 'javascript:void(0)'.",
  evidenceRequirements: ["anchors"],
  maxStrength: "weak",
  limitations: ["Single-page apps often use '#' links with click handlers."],
  falsePositiveConsiderations: ["Accessible JavaScript-driven controls implemented as links."],
  status: "active",
  provenance: { type: "documented", reference: "Heuristic", lastReviewed: REVIEWED },
  fixtures: {
    positive: ["fixtures/sites/template-default/index.html"],
    negative: ["fixtures/sites/framework-only/index.html"],
  },
  detect(bundle) {
    const total = bundle.anchors.length;
    const dead = bundle.anchors.filter(
      (a) => a.href === "#" || /^javascript:\s*(void\(0\)|;)?$/i.test(a.href),
    ).length;
    if (total < 5 || dead < 5 || dead / total < 0.4) return [];
    return [
      {
        category: "template_signal",
        subject: "Placeholder links",
        subjectType: "content",
        finding: `${dead} of ${total} links point to "#"`,
        evidenceStrength: "weak",
        evidenceKind: "indirect",
        source: "anchor href attributes",
        explanation: `Many links have no destination, which is typical of unfinished templates. ${NOT_AI}`,
        evidence: [{ type: "dom_selector", location: 'a[href="#"]', value: `${dead} element(s)` }],
        alternativeExplanations: ["Links handled by JavaScript.", "Page under construction."],
        limitations: this.limitations,
      },
    ];
  },
};

function titleOf(bundle: EvidenceBundle): string | undefined {
  return bundle.title;
}

function safePath(url: string): string {
  try {
    return new URL(url, "https://placeholder.invalid").pathname;
  } catch {
    return url;
  }
}
