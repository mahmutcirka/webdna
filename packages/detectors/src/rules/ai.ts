import { safeSnippet, type EvidenceRef } from "@webdna/shared";
import { hostOf, isSameSite } from "../site.js";
import type { Detector, DetectorResult } from "../types.js";

const REVIEWED = "2026-10-29";

/**
 * Names of AI site/app builders and coding assistants. Matching one of these inside a
 * generator meta tag or a source comment is an explicit, self-declared marker — still
 * only a claim made by the page, never a verified fact.
 */
// Patterns are deliberately specific: "lovable", "Claude", "Gemini", "Copilot", "Cursor"
// and "Windsurf" are also ordinary words, people's names and company names
// (regression tests: "Made by Claude Dupont", "Built with lovable care").
const AI_TOOLS: { name: string; re: RegExp }[] = [
  { name: "Lovable", re: /\bLovable\b|\blovable\.(?:dev|app)\b/ },
  { name: "GPT Engineer", re: /\bgpt[- ]?engineer\b/i },
  { name: "v0", re: /\bv0(\.dev|\.app| by vercel)\b/i },
  { name: "Bolt", re: /\bbolt\.new\b/i },
  { name: "Base44", re: /\bbase44\b/i },
  { name: "Durable", re: /\bdurable\.co\b/i },
  { name: "Create.xyz", re: /\bcreate\.xyz\b/i },
  { name: "Same.new", re: /\bsame\.new\b/i },
];

/** Assistant names; only reported verbatim, never used to attribute a model. */
const MODEL_NAMES: RegExp[] = [
  /\bChatGPT\b/i,
  /\bGPT-[345](?:\.\d+)?(?:-?[a-z]+)?\b/i,
  /\bClaude[ -](?:Code|Opus|Sonnet|Haiku|\d(?:\.\d)?)\b/i,
  /\bAnthropic(?:'s)? Claude\b/i,
  /\bGoogle Gemini\b|\bGemini[ -](?:Pro|Flash|Ultra|CLI|Code Assist|\d(?:\.\d)?)\b/i,
  /\b(?:GitHub|Microsoft) Copilot\b/i,
  /\bCursor (?:AI|IDE|editor)\b/i,
  /\bCodeium\b|\bWindsurf (?:IDE|editor|Cascade)\b/i,
];
const findModel = (text: string) => {
  for (const re of MODEL_NAMES) {
    const m = re.exec(text);
    if (m) return m;
  }
  return null;
};

const GENERATED_PHRASE = /\b(generated|created|built|made|written|scaffolded)\s+(by|with|using)\b/i;

/** Explicit self-declared AI-tool markers in generator meta tags and source comments. */
export const explicitAiMarkerDetector: Detector = {
  id: "ai.explicit-generator-marker",
  name: "Explicit AI-tool marker",
  version: "1.0.0",
  category: "ai_origin_signal",
  description:
    "Looks for generator meta tags or HTML/CSS/JS comments that explicitly say the page or file was generated with a named AI tool or assistant.",
  evidenceRequirements: ["meta", "htmlComments", "scriptSources", "stylesheetSources"],
  maxStrength: "strong",
  limitations: [
    "A marker is a claim made by the page; it can be copied, faked, or left behind after heavy manual editing.",
    "Visible text is deliberately ignored so that articles about AI tools are not flagged.",
    "Bundled JavaScript comments are often stripped by minifiers.",
  ],
  falsePositiveConsiderations: [
    "Comments mentioning a tool for unrelated reasons (e.g. 'see bolt.new docs').",
    "Third-party library banners that mention AI products.",
  ],
  status: "active",
  provenance: {
    type: "documented",
    reference: "Self-declared markers; no external signature database",
    lastReviewed: REVIEWED,
  },
  fixtures: {
    positive: ["fixtures/sites/generator-marker/index.html"],
    negative: ["fixtures/sites/ai-article/index.html", "fixtures/sites/framework-only/index.html"],
  },
  detect(bundle) {
    const results: DetectorResult[] = [];

    for (const meta of bundle.meta) {
      if (meta.name?.toLowerCase() !== "generator") continue;
      const tool = AI_TOOLS.find((t) => t.re.test(meta.content));
      const model = findModel(meta.content);
      if (!tool && !model) continue;
      results.push(
        result(
          tool?.name ?? model![0],
          "generator meta tag",
          {
            type: "meta",
            location: 'meta[name="generator"]',
            value: safeSnippet(meta.content, 160),
          },
          tool ? "strong" : "moderate",
          tool
            ? `The page declares ${tool.name} as its generator.`
            : `The generator meta tag names "${model![0]}". This only reports the declared value and does not identify the model that produced any code.`,
        ),
      );
    }

    const commentSources: { location: string; type: EvidenceRef["type"]; comments: string[] }[] = [
      { location: "HTML comment", type: "html_comment", comments: bundle.htmlComments },
      ...bundle.scriptSources.map((f) => ({
        location: f.url,
        type: "js_source" as const,
        comments: f.comments ?? [],
      })),
      ...bundle.stylesheetSources.map((f) => ({
        location: f.url,
        type: "css_source" as const,
        comments: f.comments ?? [],
      })),
    ];
    for (const source of commentSources) {
      // Comments in files served by another site (widgets, CDNs, analytics) describe
      // that third party, not this website.
      const thirdParty =
        source.type !== "html_comment" && !isSameSite(source.location, bundle.hostname);
      for (const comment of source.comments.slice(0, 500)) {
        if (!GENERATED_PHRASE.test(comment)) continue;
        const tool = AI_TOOLS.find((t) => t.re.test(comment));
        const model = findModel(comment);
        if (!tool && !model) continue;
        const r = result(
          tool?.name ?? model![0],
          source.type === "html_comment" ? "HTML source comment" : "source file comment",
          { type: source.type, location: source.location, value: safeSnippet(comment, 160) },
          tool ? "strong" : "moderate",
          `A source comment states that content was generated with ${tool?.name ?? `"${model![0]}"`}.`,
        );
        if (thirdParty) {
          r.evidenceStrength = "weak";
          r.evidenceKind = "indirect";
          r.limitations = [
            ...r.limitations,
            `Found in a third-party file served by ${hostOf(source.location) ?? "another host"}; it describes that file, not necessarily this website.`,
          ];
        }
        results.push(r);
        if (results.length >= 5) return results;
      }
    }
    return results;
  },
};

function result(
  subject: string,
  source: string,
  ref: EvidenceRef,
  strength: "strong" | "moderate",
  explanation: string,
): DetectorResult {
  return {
    category: "ai_origin_signal",
    subject,
    subjectType: "ai_builder",
    finding: `Explicit marker naming ${subject} observed in ${source}`,
    evidenceStrength: strength,
    evidenceKind: "direct",
    source,
    explanation: `${explanation} Explicit self-declared markers are the most direct public evidence available, but remain claims.`,
    evidence: [ref],
    alternativeExplanations: [
      "The marker was left from an initial scaffold that was later rewritten by hand.",
      "The marker was added deliberately or copied from another project.",
    ],
    limitations: explicitAiMarkerDetector.limitations,
  };
}

/** `/placeholder.svg?height=…&width=…` URLs reported as common in AI-generated React code. */
export const placeholderSvgQueryDetector: Detector = {
  id: "ai.placeholder-svg-query",
  name: "Sized placeholder.svg references",
  version: "1.0.0",
  category: "ai_origin_signal",
  description:
    "Finds image URLs of the form /placeholder.svg?height=N&width=N, which are community-reported as a default in some AI UI generators.",
  evidenceRequirements: ["assetUrls"],
  maxStrength: "weak",
  limitations: [
    "Any developer can use this URL pattern; it is a weak, indirect indicator at best.",
  ],
  falsePositiveConsiderations: [
    "Hand-written prototypes and placeholder services use similar URLs.",
  ],
  status: "experimental",
  provenance: { type: "community-reported", lastReviewed: REVIEWED },
  fixtures: {
    positive: ["fixtures/sites/ambiguous/index.html"],
    negative: ["fixtures/sites/framework-only/index.html"],
  },
  detect(bundle) {
    const hits = bundle.assetUrls.filter((u) =>
      /\/placeholder\.svg\?(.*&)?(height|width)=\d+/i.test(u),
    );
    if (hits.length === 0) return [];
    return [
      {
        category: "ai_origin_signal",
        subject: "placeholder.svg query pattern",
        finding: `${hits.length} sized placeholder.svg reference(s) observed`,
        evidenceStrength: "weak",
        evidenceKind: "indirect",
        source: "resource URLs",
        explanation:
          "This URL shape is reported to be emitted by some AI UI generators. It also appears in hand-written code, so it is never sufficient on its own.",
        evidence: hits.slice(0, 3).map((u) => ({
          type: "asset_path" as const,
          location: "requested resource",
          value: safeSnippet(u),
        })),
        alternativeExplanations: ["A developer used a local placeholder image with size hints."],
        limitations: this.limitations,
      },
    ];
  },
};
