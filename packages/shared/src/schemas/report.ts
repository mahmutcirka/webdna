import { z } from "zod";
import { AiOriginReportSchema, RectSchema } from "./findings";
import { ViewportIdSchema } from "./scan";

export const ConfidenceSchema = z.enum(["low", "medium", "high"]);
export type Confidence = z.infer<typeof ConfidenceSchema>;

/** A pointer to a measured element in a specific viewport. */
export const ElementRefSchema = z.object({
  selector: z.string(),
  viewport: ViewportIdSchema,
  rect: RectSchema.optional(),
});
export type ElementRef = z.infer<typeof ElementRefSchema>;

/** A measured value with how often (and where) it was observed. */
export const MeasuredValueSchema = z.object({
  value: z.string(),
  px: z.number().optional(),
  count: z.number(),
  properties: z.record(z.string(), z.number()),
  samples: z.array(ElementRefSchema),
});
export type MeasuredValue = z.infer<typeof MeasuredValueSchema>;

export const ColorValueSchema = MeasuredValueSchema.extend({
  hex: z.string(),
  alpha: z.number(),
  /** Original computed value when it was not plain sRGB (e.g. oklch). */
  original: z.string().optional(),
  /** Sum of the rendered area of elements using this colour as background. */
  backgroundArea: z.number(),
});
export type ColorValue = z.infer<typeof ColorValueSchema>;

export const TypeStyleSchema = z.object({
  fontFamily: z.string(),
  fontStack: z.string(),
  fontSize: z.string(),
  fontSizePx: z.number(),
  fontWeight: z.string(),
  lineHeight: z.string(),
  letterSpacing: z.string(),
  textTransform: z.string(),
  count: z.number(),
  textChars: z.number(),
  tags: z.record(z.string(), z.number()),
  samples: z.array(ElementRefSchema),
});
export type TypeStyle = z.infer<typeof TypeStyleSchema>;

export const InferredRoleSchema = z.object({
  role: z.string(),
  kind: z.enum(["color", "font", "spacing", "radius", "shadow"]),
  value: z.string(),
  confidence: ConfidenceSchema,
  basis: z.string(),
  evidence: z.array(ElementRefSchema),
});
export type InferredRole = z.infer<typeof InferredRoleSchema>;

export const CustomPropertySchema = z.object({
  name: z.string(),
  value: z.string(),
  selector: z.string(),
  source: z.string(),
});
export type CustomProperty = z.infer<typeof CustomPropertySchema>;

export const DesignSystemSchema = z.object({
  colors: z.array(ColorValueSchema),
  typography: z.object({
    families: z.array(
      z.object({ family: z.string(), count: z.number(), textChars: z.number(), stack: z.string() }),
    ),
    styles: z.array(TypeStyleSchema),
    sizeScalePx: z.array(z.number()),
  }),
  spacing: z.array(MeasuredValueSchema),
  spacingBase: z
    .object({ basePx: z.number(), share: z.number(), confidence: ConfidenceSchema })
    .optional(),
  radii: z.array(MeasuredValueSchema),
  shadows: z.array(MeasuredValueSchema),
  borders: z.array(MeasuredValueSchema),
  /** CSS custom properties declared on :root/html in fetched stylesheets (source names). */
  customProperties: z.array(CustomPropertySchema),
  roles: z.array(InferredRoleSchema),
});
export type DesignSystem = z.infer<typeof DesignSystemSchema>;

export const ComponentKindSchema = z.enum([
  "navigation",
  "header",
  "footer",
  "button",
  "link",
  "card",
  "input",
  "form",
  "dialog",
  "badge",
  "repeated_section",
  "image_container",
]);
export type ComponentKind = z.infer<typeof ComponentKindSchema>;

export const ComponentPatternSchema = z.object({
  kind: ComponentKindSchema,
  /** Human-readable variant description derived from measured styles. */
  variant: z.string(),
  count: z.number(),
  confidence: ConfidenceSchema,
  basis: z.string(),
  styles: z.record(z.string(), z.string()),
  examples: z.array(ElementRefSchema),
});
export type ComponentPattern = z.infer<typeof ComponentPatternSchema>;

export const LayoutSchema = z.object({
  flexContainers: z.number(),
  gridContainers: z.number(),
  gridPatterns: z.array(
    z.object({ columns: z.number(), count: z.number(), examples: z.array(ElementRefSchema) }),
  ),
  containerWidths: z.array(MeasuredValueSchema),
  landmarks: z.array(z.object({ tag: z.string(), role: z.string().optional(), count: z.number() })),
  headingOutline: z.array(z.object({ level: z.number(), count: z.number() })),
});
export type Layout = z.infer<typeof LayoutSchema>;

export const ResponsiveChangeSchema = z.object({
  kind: z.enum([
    "visibility",
    "layout_direction",
    "columns",
    "typography",
    "overflow",
    "navigation",
    "geometry",
  ]),
  /** "potential_issue" only for things like horizontal overflow; most changes are informational. */
  severity: z.enum(["informational", "potential_issue"]),
  from: ViewportIdSchema,
  to: ViewportIdSchema,
  selector: z.string().optional(),
  description: z.string(),
  before: z.string().optional(),
  after: z.string().optional(),
});
export type ResponsiveChange = z.infer<typeof ResponsiveChangeSchema>;

export const ScreenshotSetSchema = z.object({
  viewport: z.string(),
  fullPage: z.string().optional(),
  fullPageTruncated: z.boolean(),
  fullPageHeight: z.number().optional(),
});

export const ViewportObservationSchema = z.object({
  id: ViewportIdSchema,
  width: z.number(),
  height: z.number(),
  documentWidth: z.number(),
  documentHeight: z.number(),
  horizontalOverflow: z.boolean(),
  elementCount: z.number(),
  sampledElements: z.number(),
  samplingTruncated: z.boolean(),
  screenshots: ScreenshotSetSchema,
  consoleErrors: z.array(z.string()),
  failedRequests: z.array(z.object({ url: z.string(), reason: z.string() })),
  loadMs: z.number(),
  readiness: z.array(z.string()),
});
export type ViewportObservation = z.infer<typeof ViewportObservationSchema>;

export const A11yIssueSchema = z.object({
  check: z.string(),
  severity: z.enum(["info", "warning", "error"]),
  message: z.string(),
  count: z.number(),
  examples: z.array(ElementRefSchema),
});
export type A11yIssue = z.infer<typeof A11yIssueSchema>;

export const ResourceRefSchema = z.object({
  url: z.string(),
  type: z.string(),
  status: z.number().optional(),
  bytes: z.number().optional(),
  thirdParty: z.boolean(),
  inspected: z.boolean(),
  notInspectedReason: z.string().optional(),
});
export type ResourceRef = z.infer<typeof ResourceRefSchema>;

export const AssetsSchema = z.object({
  images: z.array(
    z.object({
      src: z.string(),
      naturalWidth: z.number(),
      naturalHeight: z.number(),
      renderedWidth: z.number(),
      renderedHeight: z.number(),
      hasAlt: z.boolean(),
      loading: z.string().optional(),
      format: z.string().optional(),
      selector: z.string(),
    }),
  ),
  fonts: z.array(
    z.object({ family: z.string(), weight: z.string(), style: z.string(), status: z.string() }),
  ),
  scripts: z.array(ResourceRefSchema),
  stylesheets: z.array(ResourceRefSchema),
  thirdPartyDomains: z.array(z.string()),
});
export type Assets = z.infer<typeof AssetsSchema>;

export const NamingConventionSchema = z.object({
  convention: z.string(),
  share: z.number(),
  examples: z.array(z.string()),
  confidence: ConfidenceSchema,
});

export const SourceAnalysisSchema = z.object({
  html: z.object({
    inspected: z.boolean(),
    bytes: z.number(),
    truncated: z.boolean(),
    commentCount: z.number(),
    notableComments: z.array(z.string()),
    generatorMeta: z.array(z.string()),
    inlineScripts: z.number(),
    inlineStyles: z.number(),
    externalScripts: z.number(),
    externalStylesheets: z.number(),
    dataAttributePrefixes: z.array(z.object({ prefix: z.string(), count: z.number() })),
    serverRenderedContent: z.boolean(),
  }),
  css: z.object({
    filesInspected: z.number(),
    totalBytes: z.number(),
    ruleCount: z.number(),
    customPropertyCount: z.number(),
    mediaQueries: z.array(z.object({ query: z.string(), count: z.number() })),
    breakpointsPx: z.array(z.number()),
    fontFaces: z.array(z.string()),
    namingConventions: z.array(NamingConventionSchema),
    notableComments: z.array(z.string()),
    parseErrors: z.number(),
  }),
  js: z.object({
    filesInspected: z.number(),
    totalBytes: z.number(),
    parsed: z.number(),
    parseFailures: z.number(),
    minifiedLikely: z.number(),
    moduleScripts: z.number(),
    bundlerSignatures: z.array(z.object({ name: z.string(), evidence: z.string() })),
    libraryBanners: z.array(z.object({ file: z.string(), banner: z.string() })),
    sourceMaps: z.array(
      z.object({
        script: z.string(),
        mapUrl: z.string(),
        status: z.enum(["parsed", "not_found", "blocked", "too_large", "invalid", "skipped"]),
        sourcesCount: z.number().optional(),
        topDirectories: z.array(z.object({ path: z.string(), count: z.number() })).optional(),
      }),
    ),
  }),
  manifest: z
    .object({
      url: z.string(),
      fetched: z.boolean(),
      name: z.string().optional(),
      shortName: z.string().optional(),
    })
    .optional(),
  notInspected: z.array(z.object({ url: z.string(), reason: z.string() })),
  correlations: z.array(
    z.object({
      topic: z.string(),
      status: z.enum(["consistent", "inconsistent", "unverifiable"]),
      sourceEvidence: z.string(),
      runtimeEvidence: z.string(),
    }),
  ),
  redactedSecrets: z.number(),
  limitations: z.array(z.string()),
});
export type SourceAnalysis = z.infer<typeof SourceAnalysisSchema>;

export const ReportWarningSchema = z.object({
  code: z.string(),
  message: z.string(),
});
export type ReportWarning = z.infer<typeof ReportWarningSchema>;

export const ReportSchema = z.object({
  schemaVersion: z.string(),
  generator: z.object({ name: z.literal("WebDNA"), version: z.string() }),
  scanId: z.string(),
  createdAt: z.string(),
  durationMs: z.number(),
  /** Set for example/synthetic reports so the UI can label them. */
  sample: z.object({ label: z.string() }).optional(),
  target: z.object({
    inputUrl: z.string(),
    normalizedUrl: z.string(),
    finalUrl: z.string(),
    domain: z.string(),
    redirectChain: z.array(z.string()),
    statusCode: z.number().optional(),
    contentType: z.string().optional(),
  }),
  metadata: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    lang: z.string().optional(),
    charset: z.string().optional(),
    viewportMeta: z.string().optional(),
    canonical: z.string().optional(),
    themeColor: z.string().optional(),
    generator: z.array(z.string()),
    openGraph: z.record(z.string(), z.string()),
    favicon: z.string().optional(),
  }),
  viewports: z.array(ViewportObservationSchema),
  design: DesignSystemSchema,
  layout: LayoutSchema,
  components: z.array(ComponentPatternSchema),
  responsive: z.object({
    changes: z.array(ResponsiveChangeSchema),
    breakpointsDeclared: z.array(z.number()),
    notes: z.array(z.string()),
  }),
  accessibility: z.object({
    checksRun: z.array(z.string()),
    issues: z.array(A11yIssueSchema),
    note: z.string(),
  }),
  assets: AssetsSchema,
  source: SourceAnalysisSchema,
  aiOrigin: AiOriginReportSchema,
  warnings: z.array(ReportWarningSchema),
  limits: z.record(z.string(), z.number()),
});
export type Report = z.infer<typeof ReportSchema>;
