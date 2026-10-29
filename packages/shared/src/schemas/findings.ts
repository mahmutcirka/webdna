import { z } from "zod";
import { AiConclusionSchema, ViewportIdSchema } from "./scan";

export const FindingCategorySchema = z.enum(["platform", "ai_origin_signal", "template_signal"]);
export type FindingCategory = z.infer<typeof FindingCategorySchema>;

export const EvidenceStrengthSchema = z.enum(["strong", "moderate", "weak", "inconclusive"]);
export type EvidenceStrength = z.infer<typeof EvidenceStrengthSchema>;

export const EvidenceKindSchema = z.enum(["direct", "indirect"]);
export type EvidenceKind = z.infer<typeof EvidenceKindSchema>;

export const SubjectTypeSchema = z.enum([
  "framework",
  "cms",
  "website_builder",
  "ai_builder",
  "hosting",
  "cdn",
  "build_tool",
  "css_framework",
  "library",
  "starter_template",
  "content",
]);
export type SubjectType = z.infer<typeof SubjectTypeSchema>;

export const EvidenceRefTypeSchema = z.enum([
  "url",
  "meta",
  "header",
  "html_comment",
  "script_url",
  "stylesheet_url",
  "asset_path",
  "dom_selector",
  "runtime_global",
  "visible_text",
  "js_source",
  "css_source",
  "source_map",
]);
export type EvidenceRefType = z.infer<typeof EvidenceRefTypeSchema>;

export const RectSchema = z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() });
export type Rect = z.infer<typeof RectSchema>;

/** A concrete, inspectable pointer to where a piece of evidence was observed. */
export const EvidenceRefSchema = z.object({
  type: EvidenceRefTypeSchema,
  /** Where it was observed: a meta name, header name, URL, selector, file URL... */
  location: z.string(),
  /** The matched value, truncated and with likely secrets redacted. */
  value: z.string().optional(),
  viewport: ViewportIdSchema.optional(),
  rect: RectSchema.optional(),
});
export type EvidenceRef = z.infer<typeof EvidenceRefSchema>;

export const FindingSchema = z.object({
  id: z.string(),
  detectorId: z.string(),
  detectorVersion: z.string(),
  /** Set when the finding comes from a signature file. */
  signatureId: z.string().optional(),
  signatureVersion: z.string().optional(),
  category: FindingCategorySchema,
  subject: z.string().optional(),
  subjectType: SubjectTypeSchema.optional(),
  finding: z.string(),
  evidenceStrength: EvidenceStrengthSchema,
  evidenceKind: EvidenceKindSchema,
  source: z.string(),
  explanation: z.string(),
  evidence: z.array(EvidenceRefSchema),
  alternativeExplanations: z.array(z.string()),
  limitations: z.array(z.string()),
  /** True when produced by a rule marked experimental; strength is capped at "weak". */
  experimental: z.boolean(),
});
export type Finding = z.infer<typeof FindingSchema>;

export const DetectorStatusSchema = z.enum(["active", "experimental", "disabled"]);
export type DetectorStatus = z.infer<typeof DetectorStatusSchema>;

export const DetectorRunSchema = z.object({
  id: z.string(),
  version: z.string(),
  name: z.string(),
  category: FindingCategorySchema,
  status: DetectorStatusSchema,
  ran: z.boolean(),
  findingCount: z.number(),
  error: z.string().optional(),
});
export type DetectorRun = z.infer<typeof DetectorRunSchema>;

export const EvidenceCoverageSchema = z.object({
  htmlInspected: z.boolean(),
  renderedDomInspected: z.boolean(),
  scriptsInspected: z.number(),
  scriptsTotal: z.number(),
  stylesheetsInspected: z.number(),
  stylesheetsTotal: z.number(),
  visibleTextChars: z.number(),
  headersInspected: z.boolean(),
  blockingPageSuspected: z.boolean(),
  notes: z.array(z.string()),
});
export type EvidenceCoverage = z.infer<typeof EvidenceCoverageSchema>;

export const PlatformSummarySchema = z.object({
  name: z.string(),
  type: SubjectTypeSchema,
  strength: EvidenceStrengthSchema,
  findingIds: z.array(z.string()),
});
export type PlatformSummary = z.infer<typeof PlatformSummarySchema>;

export const AiOriginReportSchema = z.object({
  conclusion: AiConclusionSchema,
  conclusionLabel: z.string(),
  rationale: z.array(z.string()),
  platformIdentification: z.object({
    identified: z.boolean(),
    platforms: z.array(PlatformSummarySchema),
  }),
  platformFindings: z.array(FindingSchema),
  aiFindings: z.array(FindingSchema),
  templateFindings: z.array(FindingSchema),
  conflicts: z.array(z.string()),
  coverage: EvidenceCoverageSchema,
  ruleSetVersion: z.string(),
  detectors: z.array(DetectorRunSchema),
  disclaimer: z.string(),
});
export type AiOriginReport = z.infer<typeof AiOriginReportSchema>;
