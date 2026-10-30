import type { OutlineKind, OutlineSection } from "@webdna/shared";
import type { RawElement, RawExtraction } from "../browser/extract-script.js";
import { parseColor, toHex } from "./color.js";
import { px, visibleStyled, type ViewportData } from "./common.js";
import { hasBg, hasBorder, hasShadow, isButtonLike, type Styled } from "./components.js";

const MAX_SECTIONS = 25;
const SKIP_TAGS = new Set(["script", "style", "noscript", "template", "link", "meta", "br"]);

/** Parent → visible child indices for one viewport. */
class Tree {
  readonly kids = new Map<number, number[]>();
  readonly bySel = new Map<string, RawElement>();
  readonly byIndex = new Map<number, RawElement>();
  constructor(readonly raw: RawExtraction) {
    for (const el of raw.elements) {
      this.bySel.set(el.sel, el);
      this.byIndex.set(el.i, el);
      if (el.p < 0) continue;
      const list = this.kids.get(el.p) ?? [];
      list.push(el.i);
      this.kids.set(el.p, list);
    }
  }
  el(i: number): RawElement {
    return this.byIndex.get(i)!;
  }
  visibleKids(i: number): RawElement[] {
    return (this.kids.get(i) ?? [])
      .map((k) => this.el(k))
      .filter((e) => e.vis && !SKIP_TAGS.has(e.tag) && e.h >= 4 && e.w >= 4);
  }
  /** Depth-first walk over the visible subtree (root included). */
  *walk(i: number): Generator<RawElement> {
    const stack = [i];
    while (stack.length) {
      const e = this.el(stack.pop()!);
      if (!e.vis) continue;
      yield e;
      // Push in reverse so children are visited in document order.
      const kids = this.kids.get(e.i) ?? [];
      for (let k = kids.length - 1; k >= 0; k -= 1) stack.push(kids[k]!);
    }
  }
  textChars(i: number): number {
    let n = 0;
    for (const e of this.walk(i)) n += e.text;
    return n;
  }
  /** Follow single-child wrappers down to the element that actually lays out content. */
  contentContainer(el: RawElement): RawElement {
    let cur = el;
    for (let guard = 0; guard < 8; guard += 1) {
      const kids = this.visibleKids(cur.i);
      if (kids.length !== 1) break;
      cur = kids[0]!;
    }
    return cur;
  }
}

const words = (chars: number) => Math.max(1, Math.round(chars / 5.5));

function columnsOf(gtc: string | undefined): number | undefined {
  if (!gtc || gtc === "none") return undefined;
  return gtc.split(/\s+(?![^(]*\))/).filter(Boolean).length;
}

function layoutOf(el: RawElement): { layout: string; columns?: number } {
  const s = el.s;
  if (!s) return { layout: "block" };
  if (s.d.includes("grid")) {
    const columns = columnsOf(s.gtc);
    return {
      layout: columns ? `grid, ${columns} column${columns === 1 ? "" : "s"}` : "grid",
      columns,
    };
  }
  if (s.d.includes("flex")) {
    const dir = s.fd.startsWith("column") ? "column" : "row";
    return { layout: `flex ${dir}${s.fwrap === "wrap" ? ", wrapping" : ""}` };
  }
  return { layout: "stacked blocks" };
}

function bgHexOf(el: RawElement): string | undefined {
  const c = el.s ? parseColor(el.s.bg) : null;
  return c && c.a > 0 ? toHex(c) : undefined;
}

/** Items in the first visual row of a group (same top edge ±6 px). */
function rowColumns(items: RawElement[]): number {
  if (items.length === 0) return 0;
  const top = Math.min(...items.map((e) => e.y));
  return items.filter((e) => Math.abs(e.y - top) <= 6).length;
}

function findTopLevelBlocks(tree: Tree): RawElement[] {
  const body = tree.raw.elements.find((e) => e.tag === "body");
  if (!body) return [];
  let blocks = tree.visibleKids(body.i);
  // Unwrap framework root wrappers (#__next, #root, …) that hold the whole page.
  for (let guard = 0; guard < 6 && blocks.length === 1; guard += 1) {
    const kids = tree.visibleKids(blocks[0]!.i);
    if (kids.length === 0) break;
    blocks = kids;
  }
  const expanded: RawElement[] = [];
  for (const b of blocks) {
    if (b.tag === "main" || b.role === "main") {
      let inner = tree.visibleKids(b.i);
      for (let guard = 0; guard < 4 && inner.length === 1; guard += 1) {
        const kids = tree.visibleKids(inner[0]!.i);
        if (kids.length === 0) break;
        inner = kids;
      }
      expanded.push(...(inner.length ? inner : [b]));
    } else expanded.push(b);
  }
  return expanded
    .filter((e) => e.h >= 16 && !(e.fixed && e.h < 24))
    .sort((a, b) => a.y - b.y)
    .slice(0, MAX_SECTIONS);
}

interface CardGroup {
  items: RawElement[];
}

function findCardGroup(tree: Tree, root: RawElement): CardGroup | undefined {
  let best: CardGroup | undefined;
  for (const el of tree.walk(root.i)) {
    const kids = tree.visibleKids(el.i).filter((k) => k.w >= 120 && k.h >= 80);
    if (kids.length < 2) continue;
    const groups = new Map<string, RawElement[]>();
    for (const k of kids) {
      const sig = `${k.tag}|${(k.cls ?? "").split(/\s+/).sort().join(".")}`;
      groups.set(sig, [...(groups.get(sig) ?? []), k]);
    }
    for (const items of groups.values()) {
      if (items.length < 2) continue;
      const first = items[0]! as Styled;
      const similarWidth = items.every((i) => Math.abs(i.w - first.w) <= first.w * 0.2);
      const boxed =
        first.s !== null &&
        (hasBorder(first) || hasShadow(first) || (hasBg(first) && first.s.bg !== el.s?.bg));
      if (!similarWidth || (!boxed && items.length < 3)) continue;
      if (!best || items.length > best.items.length) best = { items };
    }
  }
  return best;
}

function contentStats(tree: Tree, root: RawElement): OutlineSection["content"] {
  const content: OutlineSection["content"] = {
    headings: [],
    paragraphs: 0,
    paragraphWords: 0,
    links: 0,
    buttons: 0,
    images: 0,
    inputs: 0,
    forms: 0,
    listItems: 0,
  };
  for (const e of tree.walk(root.i)) {
    const h = /^h([1-6])$/.exec(e.tag);
    if (h && content.headings.length < 6) {
      content.headings.push({
        level: Number(h[1]),
        sizePx: px(e.s?.fs) ?? 0,
        weight: e.s?.fw ?? "400",
        words: words(tree.textChars(e.i)),
      });
    }
    if (e.tag === "p") {
      content.paragraphs += 1;
      content.paragraphWords += words(tree.textChars(e.i));
    }
    if (visibleStyled(e) && isButtonLike(e as Styled)) content.buttons += 1;
    else if (e.tag === "a") content.links += 1;
    if (e.tag === "img" || e.tag === "picture") content.images += e.tag === "img" ? 1 : 0;
    if (
      ["input", "select", "textarea"].includes(e.tag) &&
      !["hidden", "submit", "button", "reset", "image"].includes(e.a?.type ?? "")
    )
      content.inputs += 1;
    if (e.tag === "form") content.forms += 1;
    if (e.tag === "li") content.listItems += 1;
  }
  return content;
}

function classify(
  b: RawElement,
  index: number,
  total: number,
  content: OutlineSection["content"],
  cards: CardGroup | undefined,
  viewportHeight: number,
  seenHero: boolean,
): { kind: OutlineKind; basis: string } {
  if (b.tag === "header" || b.role === "banner")
    return { kind: "header", basis: "<header> / role=banner element" };
  if (b.tag === "footer" || b.role === "contentinfo")
    return { kind: "footer", basis: "<footer> / role=contentinfo element" };
  if (index === 0 && b.y < 10 && b.h < 180 && content.links + content.buttons >= 2)
    return { kind: "header", basis: "first block at the top with navigation links" };
  if (index === total - 1 && content.links >= 3 && content.headings.every((h) => h.level >= 3))
    return { kind: "footer", basis: "last block with several links and no major heading" };
  const topHeading = content.headings.reduce((m, h) => Math.max(m, h.sizePx), 0);
  if (
    !seenHero &&
    b.y < viewportHeight * 1.2 &&
    (content.headings.some((h) => h.level === 1) || topHeading >= 32)
  )
    return { kind: "hero", basis: "first block near the top with the main (h1 / largest) heading" };
  if (content.forms > 0 || content.inputs > 0)
    return { kind: "form", basis: "contains a form or input fields" };
  if (cards && cards.items.length >= 2)
    return { kind: "card_grid", basis: `${cards.items.length} repeated card-like siblings` };
  if (content.images >= 1 && content.paragraphs <= 1 && content.images >= content.paragraphs)
    return { kind: "media", basis: "mostly images" };
  return { kind: "content", basis: "general content block" };
}

/**
 * Section-by-section blueprint of the page from real DOM measurements (desktop), with
 * the mobile behaviour of the same elements. Text is summarised as word counts only.
 */
export function extractOutline(data: ViewportData[]): OutlineSection[] {
  const desktopData = data.find((d) => d.id === "desktop") ?? data[0];
  if (!desktopData) return [];
  const tree = new Tree(desktopData.raw);
  const mobileData = data.find((d) => d.id === "mobile");
  const mobileTree = mobileData ? new Tree(mobileData.raw) : undefined;
  const blocks = findTopLevelBlocks(tree);

  let seenHero = false;
  return blocks.map((b, index) => {
    const content = contentStats(tree, b);
    const cardGroup = findCardGroup(tree, b);
    const { kind, basis } = classify(
      b,
      index,
      blocks.length,
      content,
      cardGroup,
      desktopData.raw.viewportHeight,
      seenHero,
    );
    if (kind === "hero") seenHero = true;

    const container = tree.contentContainer(b);
    const lay = layoutOf(container);
    let maxContentWidth: number | undefined;
    for (const e of tree.walk(b.i)) {
      const mw = px(e.s?.mw);
      if (mw && mw >= 320 && mw < b.w) {
        maxContentWidth = Math.round(mw);
        break;
      }
    }
    if (!maxContentWidth && container.w < b.w - 40) maxContentWidth = container.w;

    const section: OutlineSection = {
      index,
      selector: b.sel,
      tag: b.tag,
      kind,
      kindBasis: basis,
      desktop: {
        y: b.y,
        height: b.h,
        width: b.w,
        background: bgHexOf(b),
        backgroundImage: !!b.s && b.s.bgImg !== "none",
        sticky: b.fixed,
        layout: lay.layout,
        columns: lay.columns,
        maxContentWidth,
        paddingY: b.s ? Math.round(px(b.s.pad.split(" ")[0]) ?? 0) : undefined,
      },
      content,
    };

    if (mobileTree) {
      const m = mobileTree.bySel.get(b.sel);
      if (m) {
        const mContainer = m.vis ? mobileTree.contentContainer(m) : m;
        const mLay = layoutOf(mContainer);
        section.mobile = {
          visible: m.vis,
          height: m.h,
          layout: mLay.layout,
          columns: mLay.columns,
        };
      }
    }

    if (cardGroup) {
      const first = cardGroup.items[0]! as Styled;
      const firstStats = contentStats(tree, first);
      const mobileItems = mobileTree
        ? cardGroup.items
            .map((i) => mobileTree.bySel.get(i.sel))
            .filter((e): e is RawElement => !!e && e.vis)
        : [];
      section.cards = {
        count: cardGroup.items.length,
        columnsDesktop: rowColumns(cardGroup.items),
        columnsMobile: mobileItems.length ? rowColumns(mobileItems) : undefined,
        background: bgHexOf(first),
        radius: first.s?.br,
        shadow: !!first.s && hasShadow(first),
        border: !!first.s && hasBorder(first),
        perCard: {
          headings: firstStats.headings.length,
          paragraphs: firstStats.paragraphs,
          images: firstStats.images,
        },
      };
    }
    return section;
  });
}
