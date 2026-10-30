/** Version of the persisted report format. Bump on breaking changes. */
export const REPORT_SCHEMA_VERSION = "1.1.0";
export const WEBDNA_VERSION = "0.1.0";

export const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 390, height: 844 },
} as const;

export const STAGES = [
  { id: "validating_url", label: "Validating URL" },
  { id: "launching_browser", label: "Launching isolated browser" },
  { id: "loading_page", label: "Loading the page" },
  { id: "capturing_screenshots", label: "Capturing screenshots" },
  { id: "extracting_styles", label: "Extracting styles, structure and source" },
  { id: "inferring_tokens", label: "Inferring design tokens" },
  { id: "evaluating_ai_origin", label: "Evaluating AI-origin indicators" },
  { id: "comparing_viewports", label: "Comparing viewport behavior" },
  { id: "generating_report", label: "Generating the report" },
] as const;

export const AI_CONCLUSION_LABELS = {
  strong_ai_evidence: "Strong AI-related evidence found",
  some_ai_indicators: "Some AI-related indicators found",
  weak_or_ambiguous: "Weak or ambiguous indicators found",
  no_meaningful_evidence: "No meaningful AI-origin evidence found",
  insufficient_evidence: "Insufficient evidence to determine origin",
} as const;

export const AI_ORIGIN_DISCLAIMER =
  "These categories summarise observable evidence; they are not calibrated probabilities. " +
  "A website's origin generally cannot be established from its public frontend alone: human " +
  "developers use AI tools, AI tools emit conventional code, and markers can be removed or left behind.";
