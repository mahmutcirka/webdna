import * as csstree from "css-tree";
import { extractBlockComments, safeSnippet, type CustomProperty } from "@webdna/shared";

export interface CssFileResult {
  url: string;
  bytes: number;
  rules: number;
  parseErrors: number;
  mediaQueries: string[];
  breakpointsPx: number[];
  customProperties: CustomProperty[];
  fontFaces: string[];
  comments: string[];
}

const MAX_PARSE_BYTES = 2_000_000;

/** Parse CSS as data with css-tree; never evaluated or applied. */
export function analyzeCss(url: string, text: string): CssFileResult {
  const result: CssFileResult = {
    url,
    bytes: text.length,
    rules: 0,
    parseErrors: 0,
    mediaQueries: [],
    breakpointsPx: [],
    customProperties: [],
    fontFaces: [],
    comments: [],
  };
  for (const raw of extractBlockComments(text.slice(0, MAX_PARSE_BYTES), { max: 200 })) {
    if (result.comments.length >= 50) break;
    const body = raw.trim();
    if (body.length > 0) result.comments.push(safeSnippet(body, 240));
  }

  let ast: csstree.CssNode;
  try {
    ast = csstree.parse(text.slice(0, MAX_PARSE_BYTES), {
      parseValue: false,
      parseCustomProperty: false,
      onParseError: () => {
        result.parseErrors += 1;
      },
    });
  } catch {
    result.parseErrors += 1;
    return result;
  }

  csstree.walk(ast, {
    enter(node: csstree.CssNode) {
      if (node.type === "Rule") {
        result.rules += 1;
        const selector = csstree.generate(node.prelude);
        if (/(^|,)\s*(:root|html)\b/.test(selector) && result.customProperties.length < 300) {
          node.block.children.forEach((child) => {
            if (child.type === "Declaration" && child.property.startsWith("--")) {
              result.customProperties.push({
                name: child.property,
                value: safeSnippet(csstree.generate(child.value), 160),
                selector: safeSnippet(selector, 80),
                source: url,
              });
            }
          });
        }
      }
      if (node.type === "Atrule" && node.prelude) {
        const name = node.name.toLowerCase();
        const prelude = csstree.generate(node.prelude);
        if (name === "media" || name === "container") {
          result.mediaQueries.push(`@${name} ${safeSnippet(prelude, 120)}`);
          for (const bp of prelude.matchAll(/(min|max)-width\s*:\s*(\d*\.?\d+)(px|em|rem)/gi)) {
            const value = parseFloat(bp[2]!) * (bp[3]!.toLowerCase() === "px" ? 1 : 16);
            if (value > 0 && value < 4000) result.breakpointsPx.push(Math.round(value));
          }
          for (const bp of prelude.matchAll(/width\s*(>=|<=|>|<)\s*(\d*\.?\d+)(px|em|rem)/gi)) {
            const value = parseFloat(bp[2]!) * (bp[3]!.toLowerCase() === "px" ? 1 : 16);
            if (value > 0 && value < 4000) result.breakpointsPx.push(Math.round(value));
          }
        }
      }
      if (node.type === "Atrule" && node.name.toLowerCase() === "font-face" && node.block) {
        node.block.children.forEach((child) => {
          if (child.type === "Declaration" && child.property === "font-family") {
            result.fontFaces.push(
              csstree
                .generate(child.value)
                .replace(/^["']|["']$/g, "")
                .trim(),
            );
          }
        });
      }
    },
  });
  return result;
}

const CONVENTIONS: { convention: string; re: RegExp }[] = [
  {
    convention: "Utility classes (Tailwind-style)",
    re: /^(?:[a-z0-9-]+:)*-?(?:[mp][trblxyse]?-|gap-|space-[xy]-|text-|bg-|w-|h-|min-[wh]-|max-[wh]-|rounded|shadow|flex$|grid$|inline-flex$|items-|justify-|font-|leading-|tracking-|border|col-span-|grid-cols-|z-|top-|left-|right-|bottom-|opacity-|ring-|transition|duration-|overflow-|object-|aspect-)/,
  },
  {
    convention: "BEM (block__element--modifier)",
    re: /^[a-z][a-z0-9-]*(__[a-z0-9-]+|--[a-z0-9-]+)+$/,
  },
  {
    convention: "CSS Modules (hashed local names)",
    re: /^[A-Za-z][A-Za-z0-9-]*_[A-Za-z0-9-]+__[A-Za-z0-9_-]{5,}$/,
  },
  {
    convention: "CSS-in-JS generated (styled-components / Emotion)",
    re: /^(sc-[A-Za-z0-9]{4,}|css-[a-z0-9]{5,}(-[A-Za-z]+)?)$/,
  },
  {
    convention: "Bootstrap-style classes",
    re: /^(col(-(sm|md|lg|xl|xxl))?-\d{1,2}|btn(-[a-z-]+)?|navbar(-[a-z-]+)?|container(-fluid)?|row|d-(none|flex|block)|card(-[a-z]+)?)$/,
  },
  { convention: "Svelte scoped classes", re: /^svelte-[a-z0-9]{5,}$/ },
  { convention: "Framer generated classes", re: /^framer-[A-Za-z0-9]{5,}$/ },
];

/** Classify class-name tokens observed in the rendered DOM. */
export function classifyClassNames(classAttributes: string[]): {
  convention: string;
  share: number;
  examples: string[];
  confidence: "low" | "medium" | "high";
}[] {
  const tokens = classAttributes
    .flatMap((c) => c.split(/\s+/))
    .filter(Boolean)
    .slice(0, 50_000);
  if (tokens.length < 20) return [];
  const results = [];
  for (const { convention, re } of CONVENTIONS) {
    const matches = tokens.filter((t) => re.test(t));
    const share = matches.length / tokens.length;
    if (matches.length >= 10 && share >= 0.05) {
      results.push({
        convention,
        share: Math.round(share * 1000) / 1000,
        examples: [...new Set(matches)].slice(0, 8),
        confidence: (share >= 0.4 ? "high" : share >= 0.15 ? "medium" : "low") as
          "low" | "medium" | "high",
      });
    }
  }
  return results.sort((a, b) => b.share - a.share);
}
