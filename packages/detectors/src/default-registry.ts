import aiBuilders from "../signatures/ai-builders.json" with { type: "json" };
import platforms from "../signatures/platforms.json" with { type: "json" };
import { DetectorRegistry } from "./registry.js";
import { explicitAiMarkerDetector, placeholderSvgQueryDetector } from "./rules/ai.js";
import {
  defaultAssetsDetector,
  defaultStarterDetector,
  placeholderLinksDetector,
  placeholderTextDetector,
  unreplacedVariablesDetector,
} from "./rules/template.js";
import { SignatureSetSchema, signatureDetector, type SignatureSet } from "./signatures.js";

/** Bump when code-based rules change. Signature sets carry their own versions. */
export const ENGINE_RULES_VERSION = "1.0.0";

export const SIGNATURE_SETS: SignatureSet[] = [platforms, aiBuilders].map((raw) =>
  SignatureSetSchema.parse(raw),
);

export const RULE_SET_VERSION = [
  `engine@${ENGINE_RULES_VERSION}`,
  ...SIGNATURE_SETS.map((s) => `${s.signatureSet}@${s.version}`),
].join("+");

export function createDefaultRegistry(): DetectorRegistry {
  const registry = new DetectorRegistry(RULE_SET_VERSION);
  for (const set of SIGNATURE_SETS) {
    for (const signature of set.signatures) registry.register(signatureDetector(signature, set));
  }
  registry
    .register(explicitAiMarkerDetector)
    .register(placeholderSvgQueryDetector)
    .register(placeholderTextDetector)
    .register(defaultStarterDetector)
    .register(unreplacedVariablesDetector)
    .register(defaultAssetsDetector)
    .register(placeholderLinksDetector);
  return registry;
}
