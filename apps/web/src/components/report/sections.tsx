"use client";

import { AlertTriangle, Download, Search } from "lucide-react";
import type { ReactNode } from "react";
import type { MeasuredValue, Report } from "@webdna/shared";
import {
  Badge,
  Callout,
  Card,
  CardHeader,
  Empty,
  LinkButton,
  Mono,
  Stat,
  Table,
  Td,
  conclusionTone,
} from "../ui";
import { useI18n } from "@/i18n/client";
import { fromElementRefs, useInspect, type ScreenshotSource } from "./inspector";

function InspectButton({
  title,
  refs,
  subtitle,
}: {
  title: string;
  subtitle?: string;
  refs: Parameters<typeof fromElementRefs>[0];
}) {
  const inspect = useInspect();
  const { t } = useI18n();
  if (refs.length === 0) return null;
  return (
    <button
      className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
      onClick={() => inspect({ title, subtitle, items: fromElementRefs(refs) })}
    >
      <Search size={12} />{" "}
      {t(refs.length === 1 ? "common.example.one" : "common.example.other", { n: refs.length })}
    </button>
  );
}

// ---------------- Overview ----------------

export function OverviewSection({ report, shots }: { report: Report; shots: ScreenshotSource }) {
  const { t, tEnum } = useI18n();
  const target = report.target;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label={t("ov.http")}
          value={String(target.statusCode ?? "—")}
          hint={target.contentType}
        />
        <Stat label={t("ov.colors")} value={String(report.design.colors.length)} />
        <Stat label={t("ov.components")} value={String(report.components.length)} />
        <Stat label={t("ov.duration")} value={`${(report.durationMs / 1000).toFixed(1)} s`} />
      </div>
      {report.warnings.length > 0 && (
        <Callout tone="warn" icon={<AlertTriangle size={15} />}>
          <div className="font-medium">{t("ov.warnings")}</div>
          <ul className="mt-1 list-disc pl-4">
            {report.warnings.map((w) => (
              <li key={w.code + w.message}>{w.message}</li>
            ))}
          </ul>
        </Callout>
      )}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("ov.target")} />
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 px-5 py-4 text-sm">
            <dt className="text-muted">{t("ov.inputUrl")}</dt>
            <dd className="break-all font-mono text-xs text-text">{target.inputUrl}</dd>
            <dt className="text-muted">{t("ov.finalUrl")}</dt>
            <dd className="break-all font-mono text-xs text-text">{target.finalUrl}</dd>
            {target.redirectChain.length > 0 && (
              <>
                <dt className="text-muted">{t("ov.redirects")}</dt>
                <dd className="break-all font-mono text-xs text-text">
                  {target.redirectChain.join(" → ")}
                </dd>
              </>
            )}
            <dt className="text-muted">{t("ov.title")}</dt>
            <dd className="text-text">{report.metadata.title ?? "—"}</dd>
            <dt className="text-muted">{t("ov.description")}</dt>
            <dd className="text-text">{report.metadata.description ?? "—"}</dd>
            <dt className="text-muted">{t("ov.language")}</dt>
            <dd className="text-text">{report.metadata.lang ?? t("common.notDeclared")}</dd>
            <dt className="text-muted">{t("ov.generator")}</dt>
            <dd className="text-text">
              {report.metadata.generator.join(", ") || t("common.noneDeclared")}
            </dd>
            <dt className="text-muted">{t("ov.scanned")}</dt>
            <dd className="text-text">
              {/* Formatted in the viewer's locale and time zone; may differ from the server render. */}
              <time dateTime={report.createdAt} suppressHydrationWarning>
                {new Date(report.createdAt).toLocaleString()}
              </time>
            </dd>
          </dl>
        </Card>
        <Card>
          <CardHeader title={t("ov.aiSummary")} description={t("ov.aiSummary.desc")} />
          <div className="space-y-3 px-5 py-4 text-sm">
            <Badge tone={conclusionTone(report.aiOrigin.conclusion)} className="px-2 py-1 text-sm">
              {tEnum("conclusion", report.aiOrigin.conclusion)}
            </Badge>
            <div>
              <span className="text-muted">{t("ov.platforms")} </span>
              <span className="text-text">
                {report.aiOrigin.platformIdentification.platforms.map((p) => p.name).join(", ") ||
                  t("common.none")}
              </span>
            </div>
            <div className="text-muted">
              {t("ov.findingCounts", {
                ai: report.aiOrigin.aiFindings.length,
                tpl: report.aiOrigin.templateFindings.length,
                pf: report.aiOrigin.platformFindings.length,
              })}
            </div>
          </div>
        </Card>
      </div>
      <Card>
        <CardHeader title={t("ov.viewports")} description={t("ov.viewports.desc")} />
        <div className="grid gap-4 p-5 sm:grid-cols-3">
          {report.viewports.map((v) => (
            <figure key={v.id}>
              <img
                src={shots.url(v.screenshots.viewport)}
                alt={t("insp.screenshotAlt", { vp: tEnum("vp", v.id) })}
                className="w-full rounded border border-border"
                loading="lazy"
              />
              <figcaption className="mt-2 text-xs text-muted">
                {t("ov.vpCaption", {
                  vp: tEnum("vp", v.id),
                  w: v.width,
                  h: v.height,
                  dw: v.documentWidth,
                  dh: v.documentHeight,
                })}
                {v.horizontalOverflow && <span className="text-warn"> · {t("ov.hOverflow")}</span>}
                <div className="text-faint">
                  {t("ov.measured", {
                    s: v.sampledElements,
                    n: v.elementCount,
                    t: (v.loadMs / 1000).toFixed(1),
                  })}
                </div>
                {shots.fullPage && v.screenshots.fullPage && (
                  <a
                    className="text-accent hover:underline"
                    href={shots.url(v.screenshots.fullPage)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t("ov.fullPage")}
                    {v.screenshots.fullPageTruncated ? ` ${t("ov.truncated")}` : ""}
                  </a>
                )}
              </figcaption>
            </figure>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ---------------- Design system ----------------

function ValueList({
  title,
  values,
  render,
}: {
  title: string;
  values: MeasuredValue[];
  render?: (v: MeasuredValue) => ReactNode;
}) {
  const { t } = useI18n();
  return (
    <Card>
      <CardHeader title={title} description={t("ds.distinct", { n: values.length })} />
      {values.length === 0 ? (
        <div className="p-5">
          <Empty>{t("ds.noneMeasured")}</Empty>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {values.map((v) => (
            <li key={v.value} className="flex items-center gap-3 px-5 py-2">
              {render?.(v)}
              <Mono className="max-w-[60%] truncate">{v.value}</Mono>
              <span className="ml-auto text-xs tabular-nums text-muted">{v.count}×</span>
              <InspectButton title={`${title}: ${v.value}`} refs={v.samples} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function DesignSection({ report }: { report: Report }) {
  const { t, tEnum } = useI18n();
  const d = report.design;
  const inspect = useInspect();
  const maxSpacing = Math.max(1, ...d.spacing.map((s) => s.count));
  return (
    <div className="space-y-5">
      <Callout>{t("ds.callout")}</Callout>
      <Card>
        <CardHeader title={t("ds.colors")} description={t("ds.colors.desc")} />
        <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-4 lg:grid-cols-6">
          {d.colors.map((c) => (
            <button
              key={c.hex}
              className="group overflow-hidden rounded-[3px] border border-border text-left hover:border-border-strong"
              onClick={() =>
                inspect({
                  title: t("ds.colorTitle", { hex: c.hex }),
                  subtitle: c.original ? t("ds.computedAs", { v: c.original }) : undefined,
                  items: fromElementRefs(c.samples),
                })
              }
            >
              <div className="checker h-14">
                <div className="h-full w-full" style={{ background: c.hex }} />
              </div>
              <div className="space-y-0.5 p-2">
                <div className="font-mono text-xs text-text">{c.hex}</div>
                <div className="text-[11px] text-muted">
                  {c.count}× ·{" "}
                  {Object.keys(c.properties).join(", ").replace("background-color", "bg")}
                </div>
              </div>
            </button>
          ))}
        </div>
      </Card>
      <Card>
        <CardHeader title={t("ds.roles")} description={t("ds.roles.desc")} />
        {d.roles.length === 0 ? (
          <div className="p-5">
            <Empty>{t("ds.roles.none")}</Empty>
          </div>
        ) : (
          <Table
            head={[
              t("ds.head.role"),
              t("ds.head.value"),
              t("ds.head.confidence"),
              t("ds.head.basis"),
              "",
            ]}
          >
            {d.roles.map((r) => (
              <tr key={r.role}>
                <Td className="font-medium">{tEnum("role", r.role)}</Td>
                <Td>
                  <span className="inline-flex items-center gap-2">
                    {r.kind === "color" && (
                      <span
                        className="inline-block h-4 w-4 rounded border border-border"
                        style={{ background: r.value }}
                      />
                    )}
                    <Mono>{r.value}</Mono>
                  </span>
                </Td>
                <Td>
                  <Badge
                    tone={
                      r.confidence === "high"
                        ? "accent"
                        : r.confidence === "medium"
                          ? "info"
                          : "neutral"
                    }
                  >
                    {tEnum("confidence", r.confidence)}
                  </Badge>
                </Td>
                <Td className="text-muted">{r.basis}</Td>
                <Td>
                  <InspectButton
                    title={t("ds.roleTitle", { r: tEnum("role", r.role) })}
                    refs={r.evidence}
                  />
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title={t("ds.spacing")}
            description={
              d.spacingBase
                ? t("ds.spacingBase", {
                    px: d.spacingBase.basePx,
                    pct: Math.round(d.spacingBase.share * 100),
                    c: tEnum("confidence", d.spacingBase.confidence),
                  })
                : t("ds.spacingNone")
            }
          />
          <ul className="space-y-1.5 p-5">
            {d.spacing.slice(0, 20).map((s) => (
              <li key={s.value} className="flex items-center gap-3 text-xs">
                <Mono className="w-16 shrink-0 text-right">{s.value}</Mono>
                <div className="h-2 flex-1 rounded bg-surface-2">
                  <div
                    className="h-2 rounded bg-accent/70"
                    style={{ width: `${(s.count / maxSpacing) * 100}%` }}
                  />
                </div>
                <span className="w-24 shrink-0 text-right text-muted">{s.count}×</span>
              </li>
            ))}
          </ul>
        </Card>
        <ValueList
          title={t("ds.radii")}
          values={d.radii}
          render={(v) => (
            <span
              className="inline-block h-6 w-6 shrink-0 border border-border-strong bg-surface-2"
              style={{ borderRadius: v.value }}
            />
          )}
        />
        <ValueList
          title={t("ds.shadows")}
          values={d.shadows}
          render={(v) => (
            <span
              className="inline-block h-6 w-6 shrink-0 rounded bg-surface"
              style={{ boxShadow: v.value }}
            />
          )}
        />
        <ValueList title={t("ds.borders")} values={d.borders} />
      </div>
      <Card>
        <CardHeader title={t("ds.custom")} description={t("ds.custom.desc")} />
        {d.customProperties.length === 0 ? (
          <div className="p-5">
            <Empty>{t("ds.custom.none")}</Empty>
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            <Table
              head={[
                t("ds.head.name"),
                t("ds.head.value"),
                t("ds.head.selector"),
                t("ds.head.source"),
              ]}
            >
              {d.customProperties.slice(0, 150).map((p) => (
                <tr key={p.name + p.selector + p.source}>
                  <Td>
                    <Mono>{p.name}</Mono>
                  </Td>
                  <Td>
                    <Mono>{p.value}</Mono>
                  </Td>
                  <Td className="text-muted">{p.selector}</Td>
                  <Td className="max-w-[16rem] truncate text-xs text-faint">{p.source}</Td>
                </tr>
              ))}
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ---------------- Typography ----------------

export function TypographySection({ report }: { report: Report }) {
  const { t, formatNumber } = useI18n();
  const ty = report.design.typography;
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title={t("ty.families")} description={t("ty.families.desc")} />
        <Table
          head={[
            t("ty.head.family"),
            t("ty.head.elements"),
            t("ty.head.chars"),
            t("ty.head.stack"),
          ]}
        >
          {ty.families.map((f) => (
            <tr key={f.family}>
              <Td className="font-medium">
                <span style={{ fontFamily: f.stack }}>{f.family}</span>
              </Td>
              <Td className="tabular-nums">{f.count}</Td>
              <Td className="tabular-nums">{formatNumber(f.textChars)}</Td>
              <Td>
                <Mono>{f.stack}</Mono>
              </Td>
            </tr>
          ))}
        </Table>
      </Card>
      <Card>
        <CardHeader
          title={t("ty.styles")}
          description={t("ty.styles.desc", { s: ty.sizeScalePx.join(" · ") })}
        />
        <ul className="divide-y divide-border">
          {ty.styles.map((s, i) => (
            <li
              key={i}
              className="flex flex-col gap-2 px-5 py-3 md:flex-row md:items-center md:gap-6"
            >
              <div
                className="min-w-0 flex-1 truncate text-text"
                style={{
                  fontFamily: s.fontStack,
                  fontSize: Math.min(s.fontSizePx, 56),
                  fontWeight: Number(s.fontWeight) || undefined,
                  lineHeight: 1.2,
                  letterSpacing: s.letterSpacing === "normal" ? undefined : s.letterSpacing,
                  textTransform: s.textTransform as "none",
                }}
              >
                {t("ty.preview")}
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2 text-xs text-muted">
                <Mono>
                  {s.fontFamily} {s.fontSize}/{s.lineHeight} {s.fontWeight}
                </Mono>
                <span>
                  {Object.entries(s.tags)
                    .map(([k, v]) => `${k}×${v}`)
                    .join(" ")}
                </span>
                <InspectButton
                  title={t("ty.styleTitle", { s: s.fontSize, w: s.fontWeight })}
                  refs={s.samples}
                />
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

// ---------------- Components ----------------

export function ComponentsSection({ report }: { report: Report }) {
  const { t, tEnum } = useI18n();
  return (
    <div className="space-y-5">
      <Callout>{t("co.callout")}</Callout>
      {report.components.length === 0 ? (
        <Empty>{t("co.none")}</Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {report.components.map((c, i) => (
            <Card key={i} className="p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold capitalize text-text">
                  {tEnum("ckind", c.kind)}
                </span>
                <Badge
                  tone={
                    c.confidence === "high"
                      ? "accent"
                      : c.confidence === "medium"
                        ? "info"
                        : "neutral"
                  }
                >
                  {tEnum("confidence", c.confidence)}
                </Badge>
              </div>
              <div className="mt-1 text-xs text-muted">{c.variant}</div>
              <div className="mt-3 text-2xl font-semibold tabular-nums text-text">{c.count}</div>
              {Object.keys(c.styles).length > 0 && (
                <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                  {Object.entries(c.styles).map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="text-muted">{k}</dt>
                      <dd className="truncate font-mono text-text">{v}</dd>
                    </div>
                  ))}
                </dl>
              )}
              <div className="mt-3 border-t border-border pt-2 text-[11px] text-faint">
                {c.basis}
              </div>
              <div className="mt-2">
                <InspectButton
                  title={`${tEnum("ckind", c.kind)}: ${c.variant}`}
                  refs={c.examples}
                />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------- Layout ----------------

export function LayoutSection({ report }: { report: Report }) {
  const { t } = useI18n();
  const l = report.layout;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={t("la.flex")} value={String(l.flexContainers)} />
        <Stat label={t("la.grid")} value={String(l.gridContainers)} />
        <Stat
          label={t("la.landmarks")}
          value={String(l.landmarks.reduce((n, x) => n + x.count, 0))}
        />
        <Stat
          label={t("la.headings")}
          value={String(l.headingOutline.reduce((n, x) => n + x.count, 0))}
        />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("la.gridPatterns")} description={t("la.gridPatterns.desc")} />
          {l.gridPatterns.length === 0 ? (
            <div className="p-5">
              <Empty>{t("la.gridNone")}</Empty>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {l.gridPatterns.map((g) => (
                <li key={g.columns} className="flex items-center gap-3 px-5 py-2 text-sm">
                  <span className="text-text">
                    {t(g.columns === 1 ? "la.column.one" : "la.column.other", { n: g.columns })}
                  </span>
                  <span className="ml-auto text-xs text-muted">{g.count}×</span>
                  <InspectButton title={t("la.gridTitle", { n: g.columns })} refs={g.examples} />
                </li>
              ))}
            </ul>
          )}
        </Card>
        <ValueList title={t("la.maxWidths")} values={l.containerWidths} />
        <Card>
          <CardHeader title={t("la.landmarksRoles")} />
          <Table head={[t("la.head.element"), t("la.head.role"), t("la.head.count")]}>
            {l.landmarks.map((x) => (
              <tr key={x.tag + (x.role ?? "")}>
                <Td>
                  <Mono>{x.tag}</Mono>
                </Td>
                <Td className="text-muted">{x.role ?? "—"}</Td>
                <Td className="tabular-nums">{x.count}</Td>
              </tr>
            ))}
          </Table>
        </Card>
        <Card>
          <CardHeader title={t("la.outline")} />
          <div className="flex flex-wrap gap-2 p-5">
            {l.headingOutline.length === 0 ? (
              <Empty>{t("la.noHeadings")}</Empty>
            ) : (
              l.headingOutline.map((h) => (
                <Badge key={h.level}>
                  h{h.level} × {h.count}
                </Badge>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ---------------- Responsive ----------------

export function ResponsiveSection({ report, shots }: { report: Report; shots: ScreenshotSource }) {
  const { t, tEnum } = useI18n();
  const r = report.responsive;
  const groups = new Map<string, typeof r.changes>();
  for (const c of r.changes)
    groups.set(`${tEnum("vp", c.from)} → ${tEnum("vp", c.to)}`, [
      ...(groups.get(`${tEnum("vp", c.from)} → ${tEnum("vp", c.to)}`) ?? []),
      c,
    ]);
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        {report.viewports.map((v) => (
          <figure key={v.id} className="rounded-[3px] border border-border bg-surface p-2">
            <img
              src={shots.url(v.screenshots.viewport)}
              alt={t("insp.screenshotAlt", { vp: tEnum("vp", v.id) })}
              className="w-full rounded"
              loading="lazy"
            />
            <figcaption className="mt-2 px-1 text-xs text-muted">
              {t("re.caption", { vp: tEnum("vp", v.id), w: v.width, dw: v.documentWidth })}
              {v.horizontalOverflow && <span className="text-warn"> {t("re.overflow")}</span>}
            </figcaption>
          </figure>
        ))}
      </div>
      <Callout>{t("re.callout")}</Callout>
      <div className="text-sm text-muted">
        {t("re.breakpoints")}{" "}
        {r.breakpointsDeclared.length
          ? r.breakpointsDeclared.map((b) => `${b}px`).join(", ")
          : t("common.noneFound")}
      </div>
      {r.notes.map((n) => (
        <Callout key={n}>{n}</Callout>
      ))}
      {[...groups.entries()].map(([pair, changes]) => (
        <Card key={pair}>
          <CardHeader title={pair} description={t("re.observed", { n: changes.length })} />
          <Table
            head={[
              t("re.head.kind"),
              t("re.head.change"),
              t("re.head.before"),
              t("re.head.after"),
              t("re.head.element"),
            ]}
          >
            {changes.map((c, i) => (
              <tr key={i}>
                <Td>
                  <Badge tone={c.severity === "potential_issue" ? "warn" : "neutral"}>
                    {tEnum("rkind", c.kind)}
                  </Badge>
                </Td>
                <Td>{c.description}</Td>
                <Td className="font-mono text-xs text-muted">{c.before ?? ""}</Td>
                <Td className="font-mono text-xs text-muted">{c.after ?? ""}</Td>
                <Td className="max-w-[18rem]">
                  {c.selector && <Mono className="block truncate">{c.selector}</Mono>}
                </Td>
              </tr>
            ))}
          </Table>
        </Card>
      ))}
      {r.changes.length === 0 && <Empty>{t("re.none")}</Empty>}
    </div>
  );
}

// ---------------- Source analysis ----------------

export function SourceSection({ report }: { report: Report }) {
  const { t, tEnum, formatNumber } = useI18n();
  const s = report.source;
  const frameworks = report.aiOrigin.platformFindings;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label={t("so.html")}
          value={s.html.inspected ? `${(s.html.bytes / 1024).toFixed(1)} KB` : t("so.notInspected")}
          hint={t("so.comments", { n: s.html.commentCount })}
        />
        <Stat
          label={t("so.cssFiles")}
          value={String(s.css.filesInspected)}
          hint={t("so.rules", { n: formatNumber(s.css.ruleCount) })}
        />
        <Stat
          label={t("so.jsFiles")}
          value={String(s.js.filesInspected)}
          hint={t("so.jsHint", { p: s.js.parsed, m: s.js.minifiedLikely })}
        />
        <Stat
          label={t("so.sourceMaps")}
          value={String(s.js.sourceMaps.filter((m) => m.status === "parsed").length)}
          hint={t("so.referenced", { n: s.js.sourceMaps.length })}
        />
      </div>
      <Card>
        <CardHeader title={t("so.frameworks")} description={t("so.frameworks.desc")} />
        {frameworks.length === 0 ? (
          <div className="p-5">
            <Empty>{t("so.frameworks.none")}</Empty>
          </div>
        ) : (
          <Table
            head={[
              t("so.head.subject"),
              t("so.head.type"),
              t("so.head.strength"),
              t("so.head.evidence"),
            ]}
          >
            {frameworks.map((f) => (
              <tr key={f.id}>
                <Td className="font-medium">{f.subject}</Td>
                <Td className="text-muted">
                  {f.subjectType ? tEnum("subject", f.subjectType) : ""}
                </Td>
                <Td>
                  <Badge>{tEnum("strength", f.evidenceStrength)}</Badge>
                </Td>
                <Td>
                  <div className="space-y-1">
                    {f.evidence.slice(0, 2).map((e, i) => (
                      <Mono key={i} className="block truncate">
                        {e.type}: {e.value ?? e.location}
                      </Mono>
                    ))}
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("so.htmlObs")} />
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 px-5 py-4 text-sm">
            <dt className="text-muted">{t("so.ssr")}</dt>
            <dd className="text-text">
              {s.html.serverRenderedContent ? t("common.yes") : t("so.ssrNone")}
            </dd>
            <dt className="text-muted">{t("so.scripts")}</dt>
            <dd className="text-text">
              {t("so.extInline", { e: s.html.externalScripts, i: s.html.inlineScripts })}
            </dd>
            <dt className="text-muted">{t("so.stylesheets")}</dt>
            <dd className="text-text">
              {t("so.extInline", { e: s.html.externalStylesheets, i: s.html.inlineStyles })}
            </dd>
            <dt className="text-muted">{t("so.generatorMeta")}</dt>
            <dd className="text-text">{s.html.generatorMeta.join(", ") || t("common.none")}</dd>
            <dt className="text-muted">{t("so.dataPrefixes")}</dt>
            <dd className="text-text">
              {s.html.dataAttributePrefixes.map((d) => `${d.prefix} (${d.count})`).join(", ") ||
                t("common.none")}
            </dd>
          </dl>
          {s.html.notableComments.length > 0 && (
            <div className="border-t border-border px-5 py-3">
              <div className="mb-2 text-xs text-muted">{t("so.htmlComments")}</div>
              <ul className="space-y-1">
                {s.html.notableComments.map((c, i) => (
                  <li key={i}>
                    <Mono>{c}</Mono>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
        <Card>
          <CardHeader title={t("so.cssObs")} />
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 px-5 py-4 text-sm">
            <dt className="text-muted">{t("so.customProps")}</dt>
            <dd className="text-text">{s.css.customPropertyCount}</dd>
            <dt className="text-muted">{t("so.breakpoints")}</dt>
            <dd className="text-text">
              {s.css.breakpointsPx.map((b) => `${b}px`).join(", ") || t("common.none")}
            </dd>
            <dt className="text-muted">@font-face</dt>
            <dd className="text-text">{s.css.fontFaces.join(", ") || t("common.none")}</dd>
            <dt className="text-muted">{t("so.parseErrors")}</dt>
            <dd className="text-text">{s.css.parseErrors}</dd>
          </dl>
          <div className="border-t border-border px-5 py-3">
            <div className="mb-2 text-xs text-muted">{t("so.naming")}</div>
            {s.css.namingConventions.length === 0 ? (
              <p className="text-sm text-muted">{t("so.namingNone")}</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {s.css.namingConventions.map((n) => (
                  <li key={n.convention}>
                    <span className="text-text">{n.convention}</span>{" "}
                    <span className="text-muted">
                      {t("so.namingShare", {
                        p: Math.round(n.share * 100),
                        c: tEnum("confidence", n.confidence),
                      })}
                    </span>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {n.examples.map((e) => (
                        <Mono key={e}>{e}</Mono>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title={t("so.jsObs")} description={t("so.jsObs.desc")} />
          <div className="space-y-3 px-5 py-4 text-sm">
            <div className="text-muted">
              {t("so.jsSummary", {
                m: s.js.moduleScripts,
                f: s.js.parseFailures,
                kb: (s.js.totalBytes / 1024).toFixed(0),
              })}
            </div>
            <div>
              <div className="mb-1 text-xs text-muted">{t("so.bundlers")}</div>
              {s.js.bundlerSignatures.length === 0 ? (
                <span className="text-muted">{t("so.noneDetected")}</span>
              ) : (
                s.js.bundlerSignatures.map((b) => (
                  <Badge key={b.name} className="mr-1">
                    {b.name}
                  </Badge>
                ))
              )}
            </div>
            <div>
              <div className="mb-1 text-xs text-muted">{t("so.banners")}</div>
              {s.js.libraryBanners.length === 0 ? (
                <span className="text-muted">{t("so.nonePreserved")}</span>
              ) : (
                <ul className="space-y-1">
                  {s.js.libraryBanners.slice(0, 8).map((b, i) => (
                    <li key={i}>
                      <Mono>{b.banner}</Mono>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {s.js.sourceMaps.length > 0 && (
              <div>
                <div className="mb-1 text-xs text-muted">{t("so.sourceMapsNote")}</div>
                <ul className="space-y-1 text-xs">
                  {s.js.sourceMaps.map((m, i) => (
                    <li key={i}>
                      <Badge tone={m.status === "parsed" ? "accent" : "neutral"}>
                        {tEnum("smap", m.status)}
                      </Badge>{" "}
                      <span className="break-all font-mono text-faint">{m.mapUrl}</span>
                      {m.topDirectories && (
                        <div className="mt-1 text-muted">
                          {m.topDirectories
                            .slice(0, 6)
                            .map((d) => `${d.path} (${d.count})`)
                            .join(", ")}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title={t("so.correlation")} description={t("so.correlation.desc")} />
          {s.correlations.length === 0 ? (
            <div className="p-5">
              <Empty>{t("so.correlation.none")}</Empty>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {s.correlations.map((c, i) => (
                <li key={i} className="px-5 py-3 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-text">{c.topic}</span>
                    <Badge
                      tone={
                        c.status === "consistent"
                          ? "accent"
                          : c.status === "inconsistent"
                            ? "warn"
                            : "outline"
                      }
                    >
                      {tEnum("corr", c.status)}
                    </Badge>
                  </div>
                  <div className="mt-1 break-all text-xs text-muted">
                    {t("so.sourceEv", { v: c.sourceEvidence })}
                  </div>
                  <div className="break-all text-xs text-muted">
                    {t("so.runtimeEv", { v: c.runtimeEvidence })}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      {s.notInspected.length > 0 && (
        <Card>
          <CardHeader title={t("so.notInspectedFiles")} />
          <ul className="divide-y divide-border">
            {s.notInspected.map((n, i) => (
              <li key={i} className="flex flex-col gap-1 px-5 py-2 text-xs sm:flex-row sm:gap-4">
                <span className="min-w-0 flex-1 break-all font-mono text-faint">{n.url}</span>
                <span className="text-muted">{n.reason}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card>
        <CardHeader title={t("so.limitations")} />
        <ul className="list-disc space-y-1 px-9 py-4 text-sm text-muted">
          {s.limitations.map((l) => (
            <li key={l}>{l}</li>
          ))}
          {s.redactedSecrets > 0 && <li>{t("so.redacted", { n: s.redactedSecrets })}</li>}
        </ul>
      </Card>
    </div>
  );
}

// ---------------- Accessibility ----------------

export function AccessibilitySection({ report }: { report: Report }) {
  const { t, tEnum } = useI18n();
  const a = report.accessibility;
  return (
    <div className="space-y-5">
      <Callout>
        {t("a11y.note")} {t("a11y.checksRun", { checks: a.checksRun.join(", ") })}
      </Callout>
      {a.issues.length === 0 ? (
        <Empty>{t("a11y.none")}</Empty>
      ) : (
        <Card>
          <Table
            head={[
              t("a11y.head.severity"),
              t("a11y.head.check"),
              t("a11y.head.observation"),
              t("a11y.head.count"),
              "",
            ]}
          >
            {a.issues.map((i, k) => (
              <tr key={k}>
                <Td>
                  <Badge
                    tone={
                      i.severity === "error"
                        ? "danger"
                        : i.severity === "warning"
                          ? "warn"
                          : "neutral"
                    }
                  >
                    {tEnum("severity", i.severity)}
                  </Badge>
                </Td>
                <Td className="text-muted">{i.check}</Td>
                <Td>{i.message}</Td>
                <Td className="tabular-nums">{i.count}</Td>
                <Td>
                  <InspectButton title={i.message} refs={i.examples} />
                </Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
    </div>
  );
}

// ---------------- Assets ----------------

export function AssetsSection({ report }: { report: Report }) {
  const { t } = useI18n();
  const a = report.assets;
  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title={t("as.images", { n: a.images.length })}
            description={t("as.images.desc")}
          />
          <div className="max-h-96 overflow-y-auto">
            <Table
              head={[
                t("as.head.source"),
                t("as.head.natural"),
                t("as.head.rendered"),
                t("as.head.alt"),
              ]}
            >
              {a.images.map((img, i) => (
                <tr key={i}>
                  <Td className="max-w-[16rem]">
                    <span className="block truncate font-mono text-xs" title={img.src}>
                      {img.src}
                    </span>
                  </Td>
                  <Td className="tabular-nums text-xs">
                    {img.naturalWidth}×{img.naturalHeight}
                  </Td>
                  <Td className="tabular-nums text-xs">
                    {img.renderedWidth}×{img.renderedHeight}
                  </Td>
                  <Td>
                    {img.hasAlt ? (
                      <Badge>{t("common.yes")}</Badge>
                    ) : (
                      <Badge tone="warn">{t("as.missing")}</Badge>
                    )}
                  </Td>
                </tr>
              ))}
            </Table>
          </div>
        </Card>
        <Card>
          <CardHeader title={t("as.fonts")} description={t("as.fonts.desc")} />
          {a.fonts.length === 0 ? (
            <div className="p-5">
              <Empty>{t("as.fonts.none")}</Empty>
            </div>
          ) : (
            <Table
              head={[
                t("as.head.family"),
                t("as.head.weight"),
                t("as.head.style"),
                t("as.head.status"),
              ]}
            >
              {a.fonts.map((f, i) => (
                <tr key={i}>
                  <Td>{f.family}</Td>
                  <Td>{f.weight}</Td>
                  <Td>{f.style}</Td>
                  <Td className="text-muted">{f.status}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
      {(["scripts", "stylesheets"] as const).map((kind) => (
        <Card key={kind}>
          <CardHeader
            title={t(kind === "scripts" ? "as.scripts" : "as.stylesheets", { n: a[kind].length })}
          />
          <div className="max-h-96 overflow-y-auto">
            <Table
              head={[
                t("as.head.url"),
                t("as.head.status"),
                t("as.head.size"),
                t("as.head.party"),
                t("as.head.inspected"),
              ]}
            >
              {a[kind].map((r, i) => (
                <tr key={i}>
                  <Td className="max-w-[28rem]">
                    <span className="block truncate font-mono text-xs" title={r.url}>
                      {r.url}
                    </span>
                  </Td>
                  <Td className="tabular-nums">{r.status ?? "—"}</Td>
                  <Td className="tabular-nums text-xs">
                    {r.bytes !== undefined ? `${(r.bytes / 1024).toFixed(1)} KB` : "—"}
                  </Td>
                  <Td>
                    {r.thirdParty ? (
                      <Badge tone="outline">{t("as.thirdParty")}</Badge>
                    ) : (
                      <Badge>{t("as.firstParty")}</Badge>
                    )}
                  </Td>
                  <Td className="text-xs text-muted">
                    {r.inspected ? t("common.yes") : (r.notInspectedReason ?? t("common.no"))}
                  </Td>
                </tr>
              ))}
            </Table>
          </div>
        </Card>
      ))}
      <Card className="p-5 text-sm">
        <div className="text-muted">{t("as.domains", { n: a.thirdPartyDomains.length })}</div>
        <div className="mt-2 flex flex-wrap gap-1">
          {a.thirdPartyDomains.map((d) => (
            <Mono key={d}>{d}</Mono>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ---------------- Export ----------------

const EXPORTS = ["json", "css", "tailwind", "markdown", "evidence"] as const;

export function ExportSection({
  scanId,
  exportHref,
}: {
  scanId?: string;
  exportHref?: (format: string) => string;
}) {
  const { t } = useI18n();
  return (
    <div className="space-y-5">
      {!scanId && <Callout tone="warn">{t("ex.sampleNote")}</Callout>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {EXPORTS.map((format) => (
          <Card key={format} className="flex flex-col p-5">
            <h3 className="text-sm font-semibold text-text">{t(`ex.${format}.title`)}</h3>
            <p className="mt-1 flex-1 text-sm text-muted">{t(`ex.${format}.text`)}</p>
            {scanId && exportHref && (
              <LinkButton className="mt-4 self-start" href={exportHref(format)} download>
                <Download size={14} /> {t("common.download")}
              </LinkButton>
            )}
          </Card>
        ))}
      </div>
      <p className="text-xs text-faint">{t("ex.footer")}</p>
    </div>
  );
}
