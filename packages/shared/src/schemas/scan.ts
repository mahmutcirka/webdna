import { z } from "zod";

export const ViewportIdSchema = z.enum(["desktop", "tablet", "mobile"]);
export type ViewportId = z.infer<typeof ViewportIdSchema>;

export const StageIdSchema = z.enum([
  "validating_url",
  "launching_browser",
  "loading_page",
  "capturing_screenshots",
  "extracting_styles",
  "inferring_tokens",
  "evaluating_ai_origin",
  "comparing_viewports",
  "generating_report",
]);
export type StageId = z.infer<typeof StageIdSchema>;

export const StageStateSchema = z.enum(["pending", "running", "done", "failed", "skipped"]);
export type StageState = z.infer<typeof StageStateSchema>;

export const ScanStatusSchema = z.enum(["queued", "running", "completed", "failed", "cancelled"]);
export type ScanStatus = z.infer<typeof ScanStatusSchema>;

export const StageProgressSchema = z.object({
  id: StageIdSchema,
  state: StageStateSchema,
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
  message: z.string().optional(),
});
export type StageProgress = z.infer<typeof StageProgressSchema>;

export const ScanErrorCodeSchema = z.enum([
  "invalid_url",
  "blocked_destination",
  "dns_failure",
  "navigation_failed",
  "navigation_timeout",
  "http_error",
  "resource_limit",
  "scan_timeout",
  "cancelled",
  "interrupted",
  "internal_error",
]);
export type ScanErrorCode = z.infer<typeof ScanErrorCodeSchema>;

export const ScanErrorSchema = z.object({
  code: ScanErrorCodeSchema,
  message: z.string(),
});
export type ScanError = z.infer<typeof ScanErrorSchema>;

export const AiConclusionSchema = z.enum([
  "strong_ai_evidence",
  "some_ai_indicators",
  "weak_or_ambiguous",
  "no_meaningful_evidence",
  "insufficient_evidence",
]);
export type AiConclusion = z.infer<typeof AiConclusionSchema>;

export const ScanRecordSchema = z.object({
  id: z.string(),
  inputUrl: z.string(),
  normalizedUrl: z.string().optional(),
  finalUrl: z.string().optional(),
  domain: z.string().optional(),
  status: ScanStatusSchema,
  createdAt: z.string(),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
  viewports: z.array(ViewportIdSchema),
  stages: z.array(StageProgressSchema),
  warnings: z.array(z.string()),
  error: ScanErrorSchema.optional(),
  reportAvailable: z.boolean(),
  /** Summary fields copied from the report for list views. */
  summary: z
    .object({
      title: z.string().optional(),
      aiConclusion: AiConclusionSchema.optional(),
      platforms: z.array(z.string()).optional(),
      ruleSetVersion: z.string().optional(),
    })
    .optional(),
});
export type ScanRecord = z.infer<typeof ScanRecordSchema>;
