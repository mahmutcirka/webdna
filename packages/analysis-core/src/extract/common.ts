import type { ElementRef, MeasuredValue, ViewportId } from "@webdna/shared";
import type { RawElement, RawExtraction } from "../browser/extract-script.js";

export interface ViewportData {
  id: ViewportId;
  raw: RawExtraction;
}

export const MAX_SAMPLES = 4;

export function ref(el: RawElement, viewport: ViewportId): ElementRef {
  return { selector: el.sel, viewport, rect: { x: el.x, y: el.y, w: el.w, h: el.h } };
}

export function px(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const m = /^(-?\d*\.?\d+)px$/.exec(value.trim());
  return m ? parseFloat(m[1]!) : undefined;
}

export function round(n: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

/** Counts measured values with per-property tallies and a few example elements. */
export class ValueCounter {
  private readonly map = new Map<string, MeasuredValue>();

  add(value: string, property: string, el: RawElement, viewport: ViewportId, weight = 1): void {
    let entry = this.map.get(value);
    if (!entry) {
      entry = { value, px: px(value), count: 0, properties: {}, samples: [] };
      this.map.set(value, entry);
    }
    entry.count += weight;
    entry.properties[property] = (entry.properties[property] ?? 0) + weight;
    if (entry.samples.length < MAX_SAMPLES && !entry.samples.some((s) => s.selector === el.sel)) {
      entry.samples.push(ref(el, viewport));
    }
  }

  values(limit = 40): MeasuredValue[] {
    return [...this.map.values()].sort((a, b) => b.count - a.count).slice(0, limit);
  }
}

export function visibleStyled(
  el: RawElement,
): el is RawElement & { s: NonNullable<RawElement["s"]> } {
  return el.vis && el.s !== null;
}

export function primaryFamily(stack: string): string {
  const first = stack.split(",")[0] ?? stack;
  return first.trim().replace(/^["']|["']$/g, "");
}
