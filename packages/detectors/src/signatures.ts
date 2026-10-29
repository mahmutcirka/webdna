import { z } from "zod";
import {
  DetectorStatusSchema,
  EvidenceKindSchema,
  EvidenceStrengthSchema,
  SubjectTypeSchema,
  safeSnippet,
  type EvidenceRef,
  type EvidenceStrength,
} from "@webdna/shared";
import type { EvidenceBundle } from "./evidence.js";
import { isSameSite } from "./site.js";
import {
  STRENGTH_ORDER,
  maxStrength,
  minStrength,
  type Detector,
  type DetectorResult,
} from "./types.js";

const MatcherBase = {
  strength: EvidenceStrengthSchema,
  kind: EvidenceKindSchema,
  explanation: z.string(),
};

export const MatcherSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("hostname"), pattern: z.string(), ...MatcherBase }),
  z.object({
    type: z.literal("meta"),
    name: z.string().optional(),
    property: z.string().optional(),
    pattern: z.string(),
    ...MatcherBase,
  }),
  z.object({
    type: z.literal("header"),
    name: z.string(),
    pattern: z.string().optional(),
    ...MatcherBase,
  }),
  z.object({ type: z.literal("html_comment"), pattern: z.string(), ...MatcherBase }),
  z.object({ type: z.literal("script_url"), pattern: z.string(), ...MatcherBase }),
  z.object({ type: z.literal("stylesheet_url"), pattern: z.string(), ...MatcherBase }),
  z.object({ type: z.literal("asset_path"), pattern: z.string(), ...MatcherBase }),
  z.object({ type: z.literal("dom_selector"), selector: z.string(), ...MatcherBase }),
  z.object({ type: z.literal("runtime_global"), name: z.string(), ...MatcherBase }),
  z.object({ type: z.literal("js_source"), pattern: z.string(), ...MatcherBase }),
  z.object({ type: z.literal("css_source"), pattern: z.string(), ...MatcherBase }),
  z.object({ type: z.literal("source_map_path"), pattern: z.string(), ...MatcherBase }),
]);
export type Matcher = z.infer<typeof MatcherSchema>;

export const SignatureSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  version: z.string(),
  name: z.string(),
  subjectType: SubjectTypeSchema,
  status: DetectorStatusSchema,
  provenance: z.object({
    type: z.enum(["documented", "maintainer-observed", "public-knowledge", "community-reported"]),
    reference: z.string().optional(),
    lastReviewed: z.string(),
  }),
  description: z.string(),
  matchers: z.array(MatcherSchema).min(1),
  aiAssociation: z
    .object({
      maxStrength: EvidenceStrengthSchema,
      rationale: z.string(),
      alternativeExplanations: z.array(z.string()),
    })
    .optional(),
  limitations: z.array(z.string()),
  falsePositiveConsiderations: z.array(z.string()),
});
export type Signature = z.infer<typeof SignatureSchema>;

export const SignatureSetSchema = z.object({
  signatureSet: z.string(),
  version: z.string(),
  description: z.string(),
  signatures: z.array(SignatureSchema),
});
export type SignatureSet = z.infer<typeof SignatureSetSchema>;

const MAX_SOURCE_SCAN = 2_000_000;

interface MatchHit {
  matcher: Matcher;
  ref: EvidenceRef;
}

function re(pattern: string, flags = "i"): RegExp {
  return new RegExp(pattern, flags);
}

/**
 * Path-only URL patterns (not anchored to a host with ^https?://) only apply to resources
 * from the same site: a third-party widget built with Next.js or hosted on WordPress must
 * not make the page itself look like one. Host-anchored patterns (e.g. a builder CDN)
 * apply to any URL.
 */
function urlEligible(pattern: string, url: string, bundle: EvidenceBundle): boolean {
  return pattern.startsWith("^https?") || isSameSite(url, bundle.hostname);
}

/** Evaluate one matcher. Returns at most a few hits so findings stay small. */
export function evaluateMatcher(matcher: Matcher, bundle: EvidenceBundle): MatchHit[] {
  const hits: MatchHit[] = [];
  const push = (ref: EvidenceRef) => {
    if (hits.length < 3) hits.push({ matcher, ref });
  };

  switch (matcher.type) {
    case "hostname":
      if (re(matcher.pattern).test(bundle.hostname)) {
        push({ type: "url", location: "final URL hostname", value: bundle.hostname });
      }
      break;
    case "meta": {
      const pattern = re(matcher.pattern);
      for (const meta of bundle.meta) {
        const keyOk =
          (matcher.name && meta.name?.toLowerCase() === matcher.name.toLowerCase()) ||
          (matcher.property && meta.property?.toLowerCase() === matcher.property.toLowerCase());
        if (keyOk && pattern.test(meta.content)) {
          const key = matcher.name
            ? `meta[name="${matcher.name}"]`
            : `meta[property="${matcher.property}"]`;
          push({ type: "meta", location: key, value: safeSnippet(meta.content, 160) });
        }
      }
      break;
    }
    case "header": {
      const value = bundle.headers[matcher.name.toLowerCase()];
      if (value !== undefined && (!matcher.pattern || re(matcher.pattern).test(value))) {
        push({
          type: "header",
          location: matcher.name.toLowerCase(),
          value: safeSnippet(value, 120),
        });
      }
      break;
    }
    case "html_comment": {
      const pattern = re(matcher.pattern);
      for (const comment of bundle.htmlComments) {
        if (pattern.test(comment))
          push({
            type: "html_comment",
            location: "HTML comment",
            value: safeSnippet(comment, 160),
          });
      }
      break;
    }
    case "script_url": {
      const pattern = re(matcher.pattern);
      for (const script of bundle.scripts) {
        if (
          script.src &&
          urlEligible(matcher.pattern, script.src, bundle) &&
          pattern.test(script.src)
        ) {
          push({
            type: "script_url",
            location: "script[src]",
            value: safeSnippet(script.src, 200),
          });
        }
      }
      break;
    }
    case "stylesheet_url": {
      const pattern = re(matcher.pattern);
      for (const href of bundle.stylesheets) {
        if (urlEligible(matcher.pattern, href, bundle) && pattern.test(href))
          push({
            type: "stylesheet_url",
            location: "link[rel=stylesheet]",
            value: safeSnippet(href, 200),
          });
      }
      break;
    }
    case "asset_path": {
      const pattern = re(matcher.pattern);
      for (const url of bundle.assetUrls) {
        if (urlEligible(matcher.pattern, url, bundle) && pattern.test(url))
          push({
            type: "asset_path",
            location: "requested resource",
            value: safeSnippet(url, 200),
          });
      }
      break;
    }
    case "dom_selector": {
      const count = bundle.selectorMatches[matcher.selector] ?? 0;
      if (count > 0) {
        push({
          type: "dom_selector",
          location: matcher.selector,
          value: `${count} matching element(s)`,
        });
      }
      break;
    }
    case "runtime_global":
      if (bundle.runtimeGlobals?.[matcher.name]) {
        push({ type: "runtime_global", location: `window.${matcher.name}`, value: "defined" });
      }
      break;
    case "js_source":
    case "css_source": {
      const pattern = re(matcher.pattern);
      const files = matcher.type === "js_source" ? bundle.scriptSources : bundle.stylesheetSources;
      for (const file of files) {
        const match = pattern.exec(file.text.slice(0, MAX_SOURCE_SCAN));
        if (match) {
          push({
            type: matcher.type,
            location: file.url,
            value: safeSnippet(match[0], 120),
          });
        }
      }
      break;
    }
    case "source_map_path": {
      const pattern = re(matcher.pattern);
      for (const map of bundle.sourceMapPaths) {
        const source = map.sources.find((s) => pattern.test(s));
        if (source)
          push({ type: "source_map", location: map.mapUrl, value: safeSnippet(source, 160) });
      }
      break;
    }
  }
  return hits;
}

/** True when the matcher could not be evaluated because its evidence was unavailable. */
export function matcherUnavailable(matcher: Matcher, bundle: EvidenceBundle): boolean {
  if (matcher.type === "runtime_global") return bundle.runtimeGlobals === undefined;
  if (matcher.type === "header") return !bundle.coverage.headersInspected;
  if (matcher.type === "js_source") return bundle.scriptSources.length === 0;
  if (matcher.type === "css_source") return bundle.stylesheetSources.length === 0;
  return false;
}

/**
 * Combine matcher hits into a platform strength. Two independent matcher types at
 * moderate or above corroborate each other and raise the result to strong; weak hits
 * never escalate anything.
 */
export function combineStrength(hits: MatchHit[]): EvidenceStrength {
  let strength: EvidenceStrength = "inconclusive";
  for (const hit of hits) strength = maxStrength(strength, hit.matcher.strength);
  const corroborating = new Set(
    hits
      .filter((h) => STRENGTH_ORDER[h.matcher.strength] >= STRENGTH_ORDER.moderate)
      .map((h) => h.matcher.type),
  );
  if (strength === "moderate" && corroborating.size >= 2) strength = "strong";
  return strength;
}

/** Turn one signature into a detector. */
export function signatureDetector(signature: Signature, set: SignatureSet): Detector {
  const experimental = signature.status === "experimental";
  return {
    id: `sig.${set.signatureSet}.${signature.id}`,
    name: signature.name,
    version: signature.version,
    category: "platform",
    description: signature.description,
    evidenceRequirements: [...new Set(signature.matchers.map(requirementFor))],
    maxStrength: "strong",
    limitations: signature.limitations,
    falsePositiveConsiderations: signature.falsePositiveConsiderations,
    status: signature.status,
    provenance: signature.provenance,
    fixtures: { positive: [], negative: [] },
    requiredSelectors: signature.matchers.flatMap((m) =>
      m.type === "dom_selector" ? [m.selector] : [],
    ),
    requiredGlobals: signature.matchers.flatMap((m) =>
      m.type === "runtime_global" ? [m.name] : [],
    ),
    detect(bundle) {
      const hits = signature.matchers.flatMap((m) => evaluateMatcher(m, bundle));
      if (hits.length === 0) return [];
      const strength = combineStrength(hits);
      const unavailable = signature.matchers
        .filter((m) => matcherUnavailable(m, bundle))
        .map((m) => m.type);
      const kind = hits.some((h) => h.matcher.kind === "direct") ? "direct" : "indirect";
      const explanations = [...new Set(hits.map((h) => h.matcher.explanation))];

      const results: DetectorResult[] = [
        {
          signatureId: signature.id,
          signatureVersion: `${set.version}/${signature.version}`,
          category: "platform",
          subject: signature.name,
          subjectType: signature.subjectType,
          finding: `${signature.name} identified`,
          evidenceStrength: strength,
          evidenceKind: kind,
          source: `signature set "${set.signatureSet}" ${set.version}`,
          explanation: `${signature.description} Observed: ${explanations.join(" ")}`,
          evidence: hits.map((h) => h.ref),
          alternativeExplanations: [
            "Platform markers can be copied, proxied or left behind after a migration.",
          ],
          limitations: [
            ...signature.limitations,
            ...(unavailable.length > 0
              ? [
                  `Some matchers could not be evaluated (${[...new Set(unavailable)].join(", ")} unavailable).`,
                ]
              : []),
          ],
          experimental,
        },
      ];

      if (signature.aiAssociation) {
        const ai = signature.aiAssociation;
        results.push({
          signatureId: signature.id,
          signatureVersion: `${set.version}/${signature.version}`,
          category: "ai_origin_signal",
          subject: signature.name,
          subjectType: signature.subjectType,
          finding: `Evidence potentially associated with AI-assisted generation: ${signature.name}`,
          evidenceStrength: minStrength(strength, ai.maxStrength),
          // The AI link is an inference from the platform, never a direct observation of AI use.
          evidenceKind: "indirect",
          source: `signature set "${set.signatureSet}" ${set.version} (AI association)`,
          explanation: `${ai.rationale} This finding is derived from the platform identification above.`,
          evidence: hits.map((h) => h.ref),
          alternativeExplanations: ai.alternativeExplanations,
          limitations: [
            "Identifies a tool or platform, not a model or provider.",
            "Does not measure how much of the site was AI-generated.",
          ],
          experimental,
        });
      }
      return results;
    },
  };
}

function requirementFor(matcher: Matcher): keyof EvidenceBundle {
  switch (matcher.type) {
    case "hostname":
      return "hostname";
    case "meta":
      return "meta";
    case "header":
      return "headers";
    case "html_comment":
      return "htmlComments";
    case "script_url":
      return "scripts";
    case "stylesheet_url":
      return "stylesheets";
    case "asset_path":
      return "assetUrls";
    case "dom_selector":
      return "selectorMatches";
    case "runtime_global":
      return "runtimeGlobals";
    case "js_source":
      return "scriptSources";
    case "css_source":
      return "stylesheetSources";
    case "source_map_path":
      return "sourceMapPaths";
  }
}
