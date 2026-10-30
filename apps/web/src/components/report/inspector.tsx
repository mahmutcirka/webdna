"use client";

import { X } from "lucide-react";
import { createContext, useContext, type ReactNode } from "react";
import type { ElementRef, EvidenceRef, Finding, Report, ViewportId } from "@webdna/shared";
import { useI18n } from "@/i18n/client";
import { Badge, Mono, StrengthBadge } from "../ui";

export interface InspectItem {
  type?: string;
  location: string;
  value?: string;
  viewport?: ViewportId;
  rect?: { x: number; y: number; w: number; h: number };
}

export interface InspectTarget {
  title: string;
  subtitle?: string;
  items: InspectItem[];
  finding?: Finding;
}

export function fromElementRefs(refs: ElementRef[]): InspectItem[] {
  return refs.map((r) => ({
    type: "dom_selector",
    location: r.selector,
    viewport: r.viewport,
    rect: r.rect,
  }));
}
export function fromEvidenceRefs(refs: EvidenceRef[]): InspectItem[] {
  return refs.map((r) => ({
    type: r.type,
    location: r.location,
    value: r.value,
    viewport: r.viewport,
    rect: r.rect,
  }));
}

export interface ScreenshotSource {
  /** Resolve a screenshot file name (e.g. "desktop-full.jpg") to a URL. */
  url: (name: string) => string;
  /** Whether full-page screenshots are available (not for the bundled sample). */
  fullPage: boolean;
}

export const InspectContext = createContext<(t: InspectTarget) => void>(() => undefined);
export const useInspect = () => useContext(InspectContext);

/** Draws the measured bounding box of an element on the screenshot it was measured in. */
export function ScreenshotHighlight({
  report,
  item,
  shots,
}: {
  report: Report;
  item: InspectItem;
  shots: ScreenshotSource;
}) {
  const { t, tEnum } = useI18n();
  const vp = report.viewports.find((v) => v.id === item.viewport);
  if (!vp || !item.rect) return null;
  const full = shots.fullPage && vp.screenshots.fullPage;
  const name = full ? vp.screenshots.fullPage! : vp.screenshots.viewport;
  const height = full ? (vp.screenshots.fullPageHeight ?? vp.documentHeight) : vp.height;
  const r = item.rect;
  const outside = r.y >= height;
  // Crop around the element so small elements stay visible.
  const windowH = Math.min(height, Math.max(r.h + 400, vp.height * 0.8));
  const top = Math.max(0, Math.min(height - windowH, r.y - (windowH - r.h) / 2));
  return (
    <div className="mt-2">
      {outside ? (
        <p className="text-xs text-muted">{t("insp.below", { h: height })}</p>
      ) : (
        <div
          className="relative overflow-hidden rounded border border-border bg-surface-2"
          style={{ aspectRatio: `${vp.width} / ${windowH}` }}
        >
          <img
            src={shots.url(name)}
            alt={t("insp.screenshotAlt", { vp: tEnum("vp", vp.id) })}
            className="absolute left-0 w-full max-w-none"
            style={{ top: `${(-top / windowH) * 100}%`, height: `${(height / windowH) * 100}%` }}
          />
          <div
            className="absolute rounded-sm border-2 border-accent"
            style={{
              left: `${(r.x / vp.width) * 100}%`,
              top: `${((r.y - top) / windowH) * 100}%`,
              width: `max(8px, ${(r.w / vp.width) * 100}%)`,
              height: `max(8px, ${(r.h / windowH) * 100}%)`,
              // Dim everything except the measured element so small boxes stay visible.
              boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.45)",
            }}
          />
        </div>
      )}
      <p className="mt-1 text-[11px] text-faint">
        {t("insp.box", {
          w: Math.round(r.w),
          h: Math.round(r.h),
          x: Math.round(r.x),
          y: Math.round(r.y),
          vp: tEnum("vp", vp.id),
          vw: vp.width,
        })}
      </p>
    </div>
  );
}

export function InspectorDrawer({
  target,
  report,
  shots,
  onClose,
}: {
  target?: InspectTarget;
  report: Report;
  shots: ScreenshotSource;
  onClose: () => void;
}) {
  const { t, tEnum } = useI18n();
  if (!target) return null;
  const f = target.finding;
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40" onClick={onClose}>
      <aside
        role="dialog"
        aria-label={t("insp.title")}
        className="h-full w-full max-w-xl overflow-y-auto border-l border-border bg-bg p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wide text-faint">{t("insp.title")}</div>
            <h2 className="mt-1 text-base font-semibold text-text">{target.title}</h2>
            {target.subtitle && <p className="mt-1 text-sm text-muted">{target.subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted hover:bg-surface-2 hover:text-text"
            aria-label={t("common.close")}
          >
            <X size={18} />
          </button>
        </div>

        {f && (
          <div className="mt-4 space-y-3 rounded-md border border-border bg-surface p-4 text-sm">
            <div className="flex flex-wrap gap-2">
              <StrengthBadge
                strength={f.evidenceStrength}
                label={tEnum("strength", f.evidenceStrength)}
                title={t("strength.title")}
              />
              <Badge>{t("insp.evidenceKind", { k: tEnum("kind", f.evidenceKind) })}</Badge>
              {f.experimental && <Badge tone="warn">{t("insp.experimentalRule")}</Badge>}
            </div>
            <p className="text-text">{f.explanation}</p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              <dt className="text-muted">{t("insp.detector")}</dt>
              <dd>
                <Mono>
                  {f.detectorId}@{f.detectorVersion}
                </Mono>
              </dd>
              {f.signatureVersion && (
                <>
                  <dt className="text-muted">{t("insp.signature")}</dt>
                  <dd>
                    <Mono>
                      {f.signatureId} ({f.signatureVersion})
                    </Mono>
                  </dd>
                </>
              )}
              <dt className="text-muted">{t("insp.source")}</dt>
              <dd className="text-text">{f.source}</dd>
            </dl>
            {f.alternativeExplanations.length > 0 && (
              <Block title={t("insp.alternatives")}>
                {f.alternativeExplanations.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </Block>
            )}
            {f.limitations.length > 0 && (
              <Block title={t("insp.limitations")}>
                {f.limitations.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </Block>
            )}
          </div>
        )}

        <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-faint">
          {t("insp.where", { n: target.items.length })}
        </h3>
        <ul className="mt-2 space-y-3">
          {target.items.map((item, i) => (
            <li key={i} className="rounded-md border border-border bg-surface p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                {item.type && <Badge tone="outline">{item.type}</Badge>}
                {item.viewport && <Badge>{tEnum("vp", item.viewport)}</Badge>}
              </div>
              <div className="mt-2 text-xs text-muted">{t("insp.location")}</div>
              <Mono>{item.location}</Mono>
              {item.value && (
                <>
                  <div className="mt-2 text-xs text-muted">{t("insp.value")}</div>
                  <Mono>{item.value}</Mono>
                </>
              )}
              <ScreenshotHighlight report={report} item={item} shots={shots} />
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium text-muted">{title}</div>
      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-text">{children}</ul>
    </div>
  );
}
