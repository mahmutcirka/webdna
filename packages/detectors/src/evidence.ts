import type { EvidenceCoverage } from "@webdna/shared";

/**
 * Everything a detector may look at. Built by the analysis pipeline from data the
 * safe browser session already collected (or, in tests, from a static HTML string).
 *
 * Bundles live in memory only. Detectors must copy just the minimal, truncated
 * snippet they need into a finding — never whole files or page text.
 */
export interface EvidenceBundle {
  finalUrl: string;
  hostname: string;
  title?: string;
  /** Lower-cased response headers of the main document. Empty when unavailable. */
  headers: Record<string, string>;
  /** Original HTML response (before JavaScript), capped. */
  html?: string;
  htmlComments: string[];
  meta: MetaTag[];
  /** Attributes on the root <html> element. */
  htmlAttributes: Record<string, string>;
  scripts: ScriptTag[];
  stylesheets: string[];
  links: { rel: string; href: string }[];
  /** Every resource URL observed (HTML src/href attributes and network requests). */
  assetUrls: string[];
  anchors: { href: string }[];
  /** Selector → number of matches, evaluated against the rendered (or static) DOM. */
  selectorMatches: Record<string, number>;
  /** Global name → present on window. Undefined when no browser runtime was available. */
  runtimeGlobals?: Record<string, boolean>;
  /** Visible text, capped. Undefined when not collected. */
  visibleText?: string;
  scriptSources: SourceFile[];
  stylesheetSources: SourceFile[];
  sourceMapPaths: { mapUrl: string; sources: string[] }[];
  coverage: EvidenceCoverage;
}

export interface MetaTag {
  name?: string;
  property?: string;
  httpEquiv?: string;
  content: string;
}

export interface ScriptTag {
  src?: string;
  inline: boolean;
  type?: string;
  id?: string;
  /** Inline script text, capped. */
  text?: string;
}

export interface SourceFile {
  url: string;
  text: string;
  /** Comments extracted by a parser, when available. */
  comments?: string[];
}

export function emptyCoverage(): EvidenceCoverage {
  return {
    htmlInspected: false,
    renderedDomInspected: false,
    scriptsInspected: 0,
    scriptsTotal: 0,
    stylesheetsInspected: 0,
    stylesheetsTotal: 0,
    visibleTextChars: 0,
    headersInspected: false,
    blockingPageSuspected: false,
    notes: [],
  };
}
