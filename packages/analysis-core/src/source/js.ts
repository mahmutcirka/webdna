import * as acorn from "acorn";
import { extractBlockComments, safeSnippet } from "@webdna/shared";

export interface JsFileResult {
  url: string;
  bytes: number;
  parsed: boolean;
  parseError?: string;
  module: boolean;
  minifiedLikely: boolean;
  comments: string[];
  banners: string[];
  sourceMappingUrl?: string;
}

const MAX_PARSE_BYTES = 1_500_000;
const MAX_COMMENTS = 200;

/**
 * Parse JavaScript as data with acorn to collect comments and module shape.
 * The code is never executed by WebDNA outside the isolated browser.
 */
export function analyzeJs(url: string, text: string): JsFileResult {
  const lines = text.split("\n");
  const avgLine = text.length / Math.max(1, lines.length);
  const result: JsFileResult = {
    url,
    bytes: text.length,
    parsed: false,
    module: false,
    minifiedLikely: avgLine > 300 || (lines.length < 5 && text.length > 5000),
    comments: [],
    banners: [],
  };

  const tail = text.slice(-600);
  const map = /[#@]\s*sourceMappingURL=([^\s'"]+)\s*$/m.exec(tail);
  if (map) result.sourceMappingUrl = map[1];

  const onComment = (_block: boolean, value: string) => {
    if (result.comments.length >= MAX_COMMENTS) return;
    const v = value.trim();
    if (v.length < 3 || /^[#@]\s*source(Mapping)?URL=/.test(v)) return;
    result.comments.push(safeSnippet(v, 300));
  };

  if (text.length <= MAX_PARSE_BYTES) {
    for (const sourceType of ["module", "script"] as const) {
      try {
        result.comments = [];
        acorn.parse(text, {
          ecmaVersion: "latest",
          sourceType,
          allowHashBang: true,
          allowReturnOutsideFunction: sourceType === "script",
          allowAwaitOutsideFunction: true,
          onComment,
        });
        result.parsed = true;
        result.module = sourceType === "module" && /\b(import|export)\b/.test(text);
        break;
      } catch (error) {
        result.parseError = error instanceof Error ? error.message.slice(0, 160) : "parse error";
      }
    }
    if (result.parsed) result.parseError = undefined;
  } else {
    result.parseError = `skipped parsing: larger than ${MAX_PARSE_BYTES} bytes`;
  }
  if (!result.parsed) {
    result.comments = [];
    // Fallback: preserved "/*! … */" banners via a linear scan.
    for (const body of extractBlockComments(text.slice(0, MAX_PARSE_BYTES), {
      max: MAX_COMMENTS,
      bangOnly: true,
      maxLength: 400,
    })) {
      onComment(true, body);
    }
  }
  result.banners = result.comments
    .filter((c) => /@license|^!|\bv?\d+\.\d+\.\d+\b|copyright|\(c\)/i.test(c))
    .slice(0, 10)
    .map((c) => safeSnippet(c, 140));
  return result;
}

/** Summarise source-map `sources` into top-level directories. Contents are never stored. */
export function summarizeSourcePaths(sources: string[]): { path: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const raw of sources.slice(0, 20_000)) {
    const clean = raw
      .replace(/^[a-z-]+:\/\/+[^/]*\/?/i, "")
      .replace(/^(\.\.?\/)+/, "")
      .replace(/^\/+/, "");
    const parts = clean.split("/").filter(Boolean);
    if (parts.length === 0) continue;
    const key =
      parts[0] === "node_modules"
        ? `node_modules/${parts[1]?.startsWith("@") ? `${parts[1]}/${parts[2] ?? ""}` : (parts[1] ?? "")}`
        : parts.slice(0, Math.min(2, parts.length - 1)).join("/") || parts[0]!;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([path, count]) => ({ path, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 25);
}
