import { selectAll } from "css-select";
import { DomUtils, parseDocument } from "htmlparser2";
import type { Document, Element } from "domhandler";
import type { EvidenceBundle, MetaTag, ScriptTag } from "./evidence.js";
import { emptyCoverage } from "./evidence.js";

export const MAX_HTML_BYTES = 3_000_000;
const MAX_INLINE_TEXT = 20_000;
const MAX_VISIBLE_TEXT = 40_000;
const RESOURCE_RELS = [
  "stylesheet",
  "icon",
  "apple-touch-icon",
  "mask-icon",
  "preload",
  "modulepreload",
  "prefetch",
  "manifest",
];

export interface StaticHtmlEvidence {
  document: Document;
  title?: string;
  meta: MetaTag[];
  htmlAttributes: Record<string, string>;
  htmlComments: string[];
  scripts: ScriptTag[];
  stylesheets: string[];
  inlineStyles: string[];
  links: { rel: string; href: string }[];
  anchors: { href: string }[];
  /** Absolute URLs referenced by src/href/srcset attributes. */
  referencedUrls: string[];
  /** Text outside script/style/template elements (server-rendered text). */
  text: string;
}

function resolve(href: string, base: string): string | undefined {
  try {
    return new URL(href, base).toString();
  } catch {
    return undefined;
  }
}

/** Parse an HTML string as data (no scripts are executed). */
export function parseStaticHtml(html: string, baseUrl: string): StaticHtmlEvidence {
  const document = parseDocument(html.slice(0, MAX_HTML_BYTES), { withStartIndices: false });
  const all = DomUtils.findAll(() => true, document.children);

  const meta: MetaTag[] = [];
  const scripts: ScriptTag[] = [];
  const stylesheets: string[] = [];
  const inlineStyles: string[] = [];
  const links: { rel: string; href: string }[] = [];
  const anchors: { href: string }[] = [];
  const referenced = new Set<string>();
  let title: string | undefined;
  let htmlAttributes: Record<string, string> = {};

  for (const el of all) {
    const name = el.name.toLowerCase();
    const a = el.attribs;
    if (name === "html") htmlAttributes = { ...a };
    if (name === "title" && title === undefined) title = DomUtils.textContent(el).trim();
    if (name === "meta" && a.content !== undefined) {
      meta.push({
        name: a.name,
        property: a.property,
        httpEquiv: a["http-equiv"],
        content: a.content,
      });
    }
    if (name === "script") {
      const src = a.src ? resolve(a.src, baseUrl) : undefined;
      scripts.push({
        src,
        inline: !a.src,
        type: a.type,
        id: a.id,
        text: a.src ? undefined : DomUtils.textContent(el).slice(0, MAX_INLINE_TEXT),
      });
    }
    if (name === "style") inlineStyles.push(DomUtils.textContent(el));
    if (name === "link" && a.href) {
      const href = resolve(a.href, baseUrl);
      if (href) {
        links.push({ rel: (a.rel ?? "").toLowerCase(), href });
        if ((a.rel ?? "").toLowerCase().split(/\s+/).includes("stylesheet")) stylesheets.push(href);
      }
    }
    if (name === "a" && a.href !== undefined) anchors.push({ href: a.href.trim() });
    // Only attributes that load a resource count as asset paths. Navigation links
    // (<a href>, rel=canonical/alternate) are excluded: linking to a WordPress or
    // Lovable site must not make this page look like one.
    const loadsHref =
      name === "link" &&
      RESOURCE_RELS.some((r) => (a.rel ?? "").toLowerCase().split(/\s+/).includes(r));
    for (const attr of loadsHref ? ["href"] : ["src", "poster", "data-src"]) {
      const v = a[attr];
      if (v && !v.startsWith("#") && !/^(javascript|mailto|tel|data):/i.test(v)) {
        const abs = resolve(v, baseUrl);
        if (abs) referenced.add(abs);
      }
    }
    if (a.srcset) {
      for (const part of a.srcset.split(",")) {
        const abs = resolve(part.trim().split(/\s+/)[0] ?? "", baseUrl);
        if (abs) referenced.add(abs);
      }
    }
  }

  const htmlComments: string[] = [];
  const walk = (nodes: Document["children"]) => {
    for (const node of nodes) {
      if (node.type === "comment")
        htmlComments.push((node as unknown as { data: string }).data.trim());
      if ("children" in node && Array.isArray(node.children))
        walk(node.children as Document["children"]);
    }
  };
  walk(document.children);

  const textParts: string[] = [];
  const collectText = (nodes: Document["children"]) => {
    for (const node of nodes) {
      if (textParts.join(" ").length > MAX_VISIBLE_TEXT) return;
      if (node.type === "text") textParts.push((node as unknown as { data: string }).data);
      else if (node.type === "tag") {
        const tag = (node as Element).name.toLowerCase();
        if (["script", "style", "template", "noscript", "head"].includes(tag)) continue;
        collectText((node as Element).children as Document["children"]);
      } else if ("children" in node)
        collectText((node as Element).children as Document["children"]);
    }
  };
  collectText(document.children);

  return {
    document,
    title,
    meta,
    htmlAttributes,
    htmlComments,
    scripts,
    stylesheets,
    inlineStyles,
    links,
    anchors,
    referencedUrls: [...referenced],
    text: textParts.join(" ").replace(/\s+/g, " ").trim().slice(0, MAX_VISIBLE_TEXT),
  };
}

/** Count selector matches in a static document; invalid selectors count as 0. */
export function countSelectors(document: Document, selectors: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const selector of selectors) {
    try {
      out[selector] = selectAll(selector, document).length;
    } catch {
      out[selector] = 0;
    }
  }
  return out;
}

export interface StaticBundleOptions {
  url: string;
  headers?: Record<string, string>;
  selectors: string[];
  /** Extra sources (e.g. fixture CSS/JS files) to include. */
  scriptSources?: { url: string; text: string; comments?: string[] }[];
  stylesheetSources?: { url: string; text: string; comments?: string[] }[];
}

/**
 * Build an evidence bundle from HTML alone (no browser). Used by unit tests and the
 * evaluation harness; the production pipeline enriches the same structure with
 * rendered-DOM and network observations.
 */
export function bundleFromHtml(html: string, options: StaticBundleOptions): EvidenceBundle {
  const parsed = parseStaticHtml(html, options.url);
  const hostname = new URL(options.url).hostname;
  const coverage = emptyCoverage();
  coverage.htmlInspected = true;
  coverage.headersInspected = options.headers !== undefined;
  coverage.visibleTextChars = parsed.text.length;
  coverage.scriptsTotal = parsed.scripts.filter((s) => s.src).length;
  coverage.scriptsInspected = options.scriptSources?.length ?? 0;
  coverage.stylesheetsTotal = parsed.stylesheets.length;
  coverage.stylesheetsInspected = options.stylesheetSources?.length ?? 0;
  coverage.notes.push("Static HTML only: no browser runtime, network requests or rendered DOM.");
  coverage.blockingPageSuspected = looksLikeBlockingPage(parsed.title, parsed.text);

  const inlineStyleSources = parsed.inlineStyles.map((text, i) => ({
    url: `inline <style> #${i + 1}`,
    text,
  }));
  return {
    finalUrl: options.url,
    hostname,
    title: parsed.title,
    headers: lowerKeys(options.headers ?? {}),
    html,
    htmlComments: parsed.htmlComments,
    meta: parsed.meta,
    htmlAttributes: parsed.htmlAttributes,
    scripts: parsed.scripts,
    stylesheets: parsed.stylesheets,
    links: parsed.links,
    assetUrls: parsed.referencedUrls,
    anchors: parsed.anchors,
    selectorMatches: countSelectors(parsed.document, options.selectors),
    runtimeGlobals: undefined,
    visibleText: parsed.text,
    scriptSources: options.scriptSources ?? [],
    stylesheetSources: [...inlineStyleSources, ...(options.stylesheetSources ?? [])],
    sourceMapPaths: [],
    coverage,
  };
}

export function lowerKeys(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
}

/** Heuristic for bot-challenge / access-denied interstitials. */
export function looksLikeBlockingPage(title: string | undefined, text: string): boolean {
  const t = `${title ?? ""} ${text.slice(0, 2000)}`;
  return /just a moment\.\.\.|attention required! \| cloudflare|checking your browser|access denied|enable javascript and cookies to continue|verify you are human|ddos protection by/i.test(
    t,
  );
}
