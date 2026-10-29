import { z } from "zod";
import { ScanRecordSchema, ViewportIdSchema } from "./scan";

export const CreateScanRequestSchema = z.object({
  url: z.string().min(1).max(2048),
  viewports: z.array(ViewportIdSchema).min(1).max(3).optional(),
});
export type CreateScanRequest = z.infer<typeof CreateScanRequestSchema>;

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const ScanListResponseSchema = z.object({
  scans: z.array(ScanRecordSchema),
});
export type ScanListResponse = z.infer<typeof ScanListResponseSchema>;

export const EXPORT_FORMATS = ["json", "css", "tailwind", "markdown", "evidence"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export const ValueDiffSchema = z.object({
  added: z.array(z.string()),
  removed: z.array(z.string()),
  unchanged: z.number(),
});
export type ValueDiff = z.infer<typeof ValueDiffSchema>;

export const ReportComparisonSchema = z.object({
  a: z.object({
    scanId: z.string(),
    createdAt: z.string(),
    url: z.string(),
    ruleSetVersion: z.string(),
  }),
  b: z.object({
    scanId: z.string(),
    createdAt: z.string(),
    url: z.string(),
    ruleSetVersion: z.string(),
  }),
  sameTarget: z.boolean(),
  ruleSetChanged: z.boolean(),
  detectorVersionChanges: z.array(
    z.object({ id: z.string(), a: z.string().optional(), b: z.string().optional() }),
  ),
  colors: ValueDiffSchema,
  fontFamilies: ValueDiffSchema,
  fontSizes: ValueDiffSchema,
  spacing: ValueDiffSchema,
  radii: ValueDiffSchema,
  shadows: ValueDiffSchema,
  components: z.array(z.object({ kind: z.string(), a: z.number(), b: z.number() })),
  responsive: z.object({
    a: z.number(),
    b: z.number(),
    overflowA: z.array(z.string()),
    overflowB: z.array(z.string()),
  }),
  aiOrigin: z.object({
    conclusionA: z.string(),
    conclusionB: z.string(),
    findingsAdded: z.array(z.object({ key: z.string(), finding: z.string(), cause: z.string() })),
    findingsRemoved: z.array(z.object({ key: z.string(), finding: z.string(), cause: z.string() })),
  }),
  notes: z.array(z.string()),
});
export type ReportComparison = z.infer<typeof ReportComparisonSchema>;
