"use client";

import type { ColorValue } from "@webdna/shared";
import { useI18n } from "@/i18n/client";
import { cx } from "./ui";

/**
 * The site's "design DNA": every measured colour as a stripe whose width is proportional
 * to how often it was used. Purely a visualisation of measured data.
 */
export function DnaStrip({
  colors,
  max = 24,
  className,
  labels = false,
}: {
  colors: Pick<ColorValue, "hex" | "count">[];
  max?: number;
  className?: string;
  labels?: boolean;
}) {
  const { t } = useI18n();
  const shown = colors.slice(0, max);
  const total = shown.reduce((n, c) => n + c.count, 0) || 1;
  return (
    <figure className={cx("min-w-0", className)}>
      <div
        role="img"
        aria-label={t("dna.aria", { n: String(shown.length) })}
        className="flex h-full min-h-6 w-full overflow-hidden border border-text/80"
      >
        {shown.map((c) => (
          <div
            key={c.hex}
            title={t("dna.title", { hex: c.hex, count: String(c.count) })}
            className="h-full min-w-[3px] border-r border-text/10 last:border-r-0"
            style={{ background: c.hex, flexGrow: c.count, flexBasis: 0 }}
          />
        ))}
      </div>
      {labels && (
        <figcaption className="mt-1.5 flex min-w-0 gap-3 overflow-hidden font-mono text-[10.5px] text-faint">
          {shown.slice(0, 5).map((c) => (
            <span key={c.hex} className="shrink-0">
              {c.hex} <span className="text-muted">{Math.round((c.count / total) * 100)}%</span>
            </span>
          ))}
        </figcaption>
      )}
    </figure>
  );
}
