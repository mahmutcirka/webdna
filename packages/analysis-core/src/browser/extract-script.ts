/**
 * Read-only extraction that runs inside the isolated page via page.evaluate().
 *
 * It is kept as a plain JavaScript string (not a TS function) so that transpilers
 * cannot inject helpers that would not exist in the page context. It never modifies
 * the page and returns only measurements, attribute presence flags and capped text.
 */
export const EXTRACT_SCRIPT = String.raw`
(function (opts) {
  var MAX = opts.maxElements;
  var vw = window.innerWidth, vh = window.innerHeight;
  var sx = window.scrollX, sy = window.scrollY;
  var SKIP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEMPLATE: 1, HEAD: 1, META: 1, LINK: 1, TITLE: 1, BASE: 1 };
  var paths = new Map();
  var ID_RE = /^[A-Za-z][\w-]*$/;

  function cssPath(el) {
    if (paths.has(el)) return paths.get(el);
    var tag = el.tagName.toLowerCase();
    var result;
    if (el === document.documentElement) result = "html";
    else if (el === document.body) result = "body";
    else if (el.id && ID_RE.test(el.id) && document.querySelectorAll("#" + el.id).length === 1) result = "#" + el.id;
    else {
      var parent = el.parentElement;
      var part = tag;
      if (parent) {
        var same = 0, idx = 0;
        for (var c = parent.firstElementChild; c; c = c.nextElementSibling) {
          if (c.tagName === el.tagName) { same++; if (c === el) idx = same; }
        }
        if (same > 1) part += ":nth-of-type(" + idx + ")";
        result = cssPath(parent) + " > " + part;
      } else result = part;
    }
    paths.set(el, result);
    return result;
  }

  function ownTextLength(el) {
    var n = 0;
    for (var c = el.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 3) n += c.nodeValue.trim().length;
    }
    return n;
  }

  function bgImageKind(v) {
    if (!v || v === "none") return "none";
    if (v.indexOf("gradient(") >= 0) return "gradient";
    if (v.indexOf("url(") >= 0) return "url";
    return "other";
  }

  function hasAccessibleName(el) {
    if (el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || el.getAttribute("title")) return true;
    if ((el.textContent || "").trim().length > 0) return true;
    var imgs = el.querySelectorAll("img[alt]");
    for (var i = 0; i < imgs.length; i++) if (imgs[i].getAttribute("alt").trim()) return true;
    var svgTitle = el.querySelector("svg title");
    return !!(svgTitle && svgTitle.textContent.trim());
  }

  var elements = [];
  var truncated = false;
  var index = new Map();
  var stack = [document.documentElement];
  while (stack.length) {
    var el = stack.pop();
    if (SKIP[el.tagName]) continue;
    if (elements.length >= MAX) { truncated = true; break; }
    var cs = getComputedStyle(el);
    var r = el.getBoundingClientRect();
    var display = cs.display;
    var visible = display !== "none" && cs.visibility !== "hidden" && cs.visibility !== "collapse" &&
      parseFloat(cs.opacity) > 0 && r.width > 0 && r.height > 0;
    var tag = el.tagName.toLowerCase();
    var rec = {
      i: elements.length,
      p: el.parentElement && index.has(el.parentElement) ? index.get(el.parentElement) : -1,
      sel: cssPath(el),
      tag: tag,
      role: el.getAttribute("role") || undefined,
      cls: typeof el.className === "string" ? el.className.trim().slice(0, 160) : undefined,
      vis: visible,
      x: Math.round(r.left + sx), y: Math.round(r.top + sy), w: Math.round(r.width), h: Math.round(r.height),
      text: ownTextLength(el),
      fixed: cs.position === "fixed" || cs.position === "sticky",
      s: null,
      a: null,
      kids: el.childElementCount
    };
    if (visible || tag === "html" || tag === "body") {
      rec.s = {
        color: cs.color, bg: cs.backgroundColor, bgImg: bgImageKind(cs.backgroundImage),
        bw: [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth].join(" "),
        bs: cs.borderTopStyle, bc: cs.borderTopColor, br: cs.borderTopLeftRadius,
        sh: cs.boxShadow, ff: cs.fontFamily, fs: cs.fontSize, fw: cs.fontWeight, lh: cs.lineHeight,
        ls: cs.letterSpacing, tt: cs.textTransform, d: display, pos: cs.position,
        fd: cs.flexDirection, fwrap: cs.flexWrap, jc: cs.justifyContent, ai: cs.alignItems,
        gap: cs.rowGap + " " + cs.columnGap, gtc: cs.gridTemplateColumns,
        pad: [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].join(" "),
        mar: [cs.marginTop, cs.marginRight, cs.marginBottom, cs.marginLeft].join(" "),
        mw: cs.maxWidth, op: cs.opacity, ox: cs.overflowX, cur: cs.cursor
      };
    }
    var a = {};
    var any = false;
    function put(k, v) { if (v !== null && v !== undefined) { a[k] = v; any = true; } }
    if (tag === "a") { put("href", el.getAttribute("href")); put("nm", hasAccessibleName(el)); }
    if (tag === "button" || el.getAttribute("role") === "button") { put("nm", hasAccessibleName(el)); put("type", el.getAttribute("type")); }
    if (tag === "img") {
      put("alt", el.hasAttribute("alt") ? el.getAttribute("alt").length : -1);
      put("src", (el.currentSrc || el.src || "").slice(0, 500));
      put("nw", el.naturalWidth); put("nh", el.naturalHeight);
      put("loading", el.getAttribute("loading"));
    }
    if (tag === "input" || tag === "select" || tag === "textarea") {
      var t = (el.getAttribute("type") || "text").toLowerCase();
      put("type", t);
      var labelled = (el.labels && el.labels.length > 0) || !!el.getAttribute("aria-label") ||
        !!el.getAttribute("aria-labelledby") || !!el.getAttribute("title");
      put("lbl", labelled);
      put("ph", !!el.getAttribute("placeholder"));
    }
    if (el.hasAttribute("aria-expanded")) put("exp", el.getAttribute("aria-expanded"));
    if (el.hasAttribute("aria-controls")) put("ctl", true);
    if (el.hasAttribute("aria-haspopup")) put("pop", true);
    if (any) rec.a = a;
    index.set(el, rec.i);
    elements.push(rec);
    if (display === "none") continue;
    var kids = el.children;
    for (var k = kids.length - 1; k >= 0; k--) stack.push(kids[k]);
  }

  // Visible text, capped. Used in memory for placeholder/template checks only.
  var textParts = [];
  var textLen = 0;
  var walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
  while (walker.nextNode() && textLen < opts.maxText) {
    var node = walker.currentNode;
    var parent = node.parentElement;
    if (!parent || SKIP[parent.tagName]) continue;
    var v = node.nodeValue.trim();
    if (!v) continue;
    if (parent.checkVisibility && !parent.checkVisibility()) continue;
    textParts.push(v);
    textLen += v.length + 1;
  }

  function attrList(selector, fn, max) {
    var out = [];
    var nodes = document.querySelectorAll(selector);
    for (var i = 0; i < nodes.length && out.length < max; i++) out.push(fn(nodes[i]));
    return out;
  }

  var selectorMatches = {};
  for (var si = 0; si < opts.selectors.length; si++) {
    try { selectorMatches[opts.selectors[si]] = document.querySelectorAll(opts.selectors[si]).length; }
    catch (e) { selectorMatches[opts.selectors[si]] = 0; }
  }
  var runtimeGlobals = {};
  for (var gi = 0; gi < opts.globals.length; gi++) {
    try { runtimeGlobals[opts.globals[gi]] = opts.globals[gi] in window; } catch (e) { runtimeGlobals[opts.globals[gi]] = false; }
  }

  var fonts = [];
  try {
    document.fonts.forEach(function (f) {
      if (fonts.length < 60) fonts.push({ family: f.family.replace(/^["']|["']$/g, ""), weight: String(f.weight), style: f.style, status: f.status });
    });
  } catch (e) {}

  var overflowing = [];
  for (var oi = 0; oi < elements.length && overflowing.length < 15; oi++) {
    var e2 = elements[oi];
    if (e2.vis && e2.x + e2.w > vw + 1 && e2.tag !== "html" && e2.tag !== "body") overflowing.push({ sel: e2.sel, right: e2.x + e2.w });
  }

  var htmlAttrs = {};
  var de = document.documentElement;
  for (var ai2 = 0; ai2 < de.attributes.length; ai2++) htmlAttrs[de.attributes[ai2].name] = de.attributes[ai2].value.slice(0, 200);

  var dataPrefixes = {};
  var all = document.getElementsByTagName("*");
  for (var di = 0; di < all.length && di < 20000; di++) {
    var attrs = all[di].attributes;
    for (var dj = 0; dj < attrs.length; dj++) {
      var an = attrs[dj].name;
      if (an.indexOf("data-") === 0) {
        var prefix = an.split("-").slice(0, 2).join("-");
        dataPrefixes[prefix] = (dataPrefixes[prefix] || 0) + 1;
      }
    }
  }

  var inlineStyles = [];
  var styleTotal = 0;
  var styleNodes = document.querySelectorAll("style");
  for (var sti = 0; sti < styleNodes.length && styleTotal < opts.maxInlineCss; sti++) {
    var txt = styleNodes[sti].textContent || "";
    styleTotal += txt.length;
    inlineStyles.push(txt.slice(0, opts.maxInlineCss));
  }

  return {
    url: location.href,
    title: document.title,
    lang: de.getAttribute("lang") || undefined,
    charset: document.characterSet,
    viewportWidth: vw,
    viewportHeight: vh,
    docWidth: Math.max(de.scrollWidth, document.body ? document.body.scrollWidth : 0),
    docHeight: Math.max(de.scrollHeight, document.body ? document.body.scrollHeight : 0),
    elementCount: all.length,
    elements: elements,
    truncated: truncated,
    text: textParts.join(" ").slice(0, opts.maxText),
    meta: attrList("meta", function (m) {
      return { name: m.getAttribute("name") || undefined, property: m.getAttribute("property") || undefined,
        httpEquiv: m.getAttribute("http-equiv") || undefined, content: (m.getAttribute("content") || "").slice(0, 500) };
    }, 200),
    links: attrList("link[href]", function (l) { return { rel: (l.getAttribute("rel") || "").toLowerCase(), href: l.href }; }, 200),
    scripts: attrList("script", function (s) {
      return { src: s.src || undefined, inline: !s.src, type: s.getAttribute("type") || undefined, id: s.id || undefined,
        text: s.src ? undefined : (s.textContent || "").slice(0, 5000) };
    }, 150),
    anchors: attrList("a[href]", function (a) { return { href: (a.getAttribute("href") || "").trim().slice(0, 300) }; }, 3000),
    htmlAttributes: htmlAttrs,
    selectorMatches: selectorMatches,
    runtimeGlobals: runtimeGlobals,
    fonts: fonts,
    overflowing: overflowing,
    dataPrefixes: dataPrefixes,
    inlineStyles: inlineStyles
  };
})
`;

export interface RawElement {
  i: number;
  p: number;
  sel: string;
  tag: string;
  role?: string;
  cls?: string;
  vis: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
  text: number;
  fixed: boolean;
  kids: number;
  s: RawStyles | null;
  a: RawAttrs | null;
}

export interface RawStyles {
  color: string;
  bg: string;
  bgImg: "none" | "gradient" | "url" | "other";
  bw: string;
  bs: string;
  bc: string;
  br: string;
  sh: string;
  ff: string;
  fs: string;
  fw: string;
  lh: string;
  ls: string;
  tt: string;
  d: string;
  pos: string;
  fd: string;
  fwrap: string;
  jc: string;
  ai: string;
  gap: string;
  gtc: string;
  pad: string;
  mar: string;
  mw: string;
  op: string;
  ox: string;
  cur: string;
}

export interface RawAttrs {
  href?: string;
  nm?: boolean;
  type?: string;
  alt?: number;
  src?: string;
  nw?: number;
  nh?: number;
  loading?: string;
  lbl?: boolean;
  ph?: boolean;
  exp?: string;
  ctl?: boolean;
  pop?: boolean;
}

export interface RawExtraction {
  url: string;
  title: string;
  lang?: string;
  charset: string;
  viewportWidth: number;
  viewportHeight: number;
  docWidth: number;
  docHeight: number;
  elementCount: number;
  elements: RawElement[];
  truncated: boolean;
  text: string;
  meta: { name?: string; property?: string; httpEquiv?: string; content: string }[];
  links: { rel: string; href: string }[];
  scripts: { src?: string; inline: boolean; type?: string; id?: string; text?: string }[];
  anchors: { href: string }[];
  htmlAttributes: Record<string, string>;
  selectorMatches: Record<string, number>;
  runtimeGlobals: Record<string, boolean>;
  fonts: { family: string; weight: string; style: string; status: string }[];
  overflowing: { sel: string; right: number }[];
  dataPrefixes: Record<string, number>;
  inlineStyles: string[];
}

export interface ExtractOptions {
  maxElements: number;
  maxText: number;
  maxInlineCss: number;
  selectors: string[];
  globals: string[];
}
