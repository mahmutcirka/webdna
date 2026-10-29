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
  if (refs.length === 0) return null;
  return (
    <button
      className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
      onClick={() => inspect({ title, subtitle, items: fromElementRefs(refs) })}
    >
      <Search size={12} /> {refs.length} example{refs.length === 1 ? "" : "s"}
    </button>
  );
}

// ---------------- Overview ----------------

export function OverviewSection({ report, shots }: { report: Report; shots: ScreenshotSource }) {
  const t = report.target;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="HTTP status" value={String(t.statusCode ?? "—")} hint={t.contentType} />
        <Stat label="Colours measured" value={String(report.design.colors.length)} />
        <Stat label="Component patterns" value={String(report.components.length)} />
        <Stat label="Scan duration" value={`${(report.durationMs / 1000).toFixed(1)} s`} />
      </div>
      {report.warnings.length > 0 && (
        <Callout tone="warn" icon={<AlertTriangle size={15} />}>
          <div className="font-medium">Scan warnings</div>
          <ul className="mt-1 list-disc pl-4">
            {report.warnings.map((w) => (
              <li key={w.code + w.message}>{w.message}</li>
            ))}
          </ul>
        </Callout>
      )}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Target" />
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 px-5 py-4 text-sm">
            <dt className="text-muted">Input URL</dt>
            <dd className="break-all font-mono text-xs text-text">{t.inputUrl}</dd>
            <dt className="text-muted">Final URL</dt>
            <dd className="break-all font-mono text-xs text-text">{t.finalUrl}</dd>
            {t.redirectChain.length > 0 && (
              <>
                <dt className="text-muted">Redirects</dt>
                <dd className="break-all font-mono text-xs text-text">
                  {t.redirectChain.join(" → ")}
                </dd>
              </>
            )}
            <dt className="text-muted">Title</dt>
            <dd className="text-text">{report.metadata.title ?? "—"}</dd>
            <dt className="text-muted">Description</dt>
            <dd className="text-text">{report.metadata.description ?? "—"}</dd>
            <dt className="text-muted">Language</dt>
            <dd className="text-text">{report.metadata.lang ?? "not declared"}</dd>
            <dt className="text-muted">Generator</dt>
            <dd className="text-text">{report.metadata.generator.join(", ") || "none declared"}</dd>
            <dt className="text-muted">Scanned</dt>
            <dd className="text-text">
              {/* Formatted in the viewer's locale and time zone; may differ from the server render. */}
              <time dateTime={report.createdAt} suppressHydrationWarning>
                {new Date(report.createdAt).toLocaleString()}
              </time>
            </dd>
          </dl>
        </Card>
        <Card>
          <CardHeader
            title="AI-origin summary"
            description="See the AI-origin tab for evidence, alternatives and limitations."
          />
          <div className="space-y-3 px-5 py-4 text-sm">
            <Badge tone={conclusionTone(report.aiOrigin.conclusion)} className="px-2 py-1 text-sm">
              {report.aiOrigin.conclusionLabel}
            </Badge>
            <div>
              <span className="text-muted">Platforms identified: </span>
              <span className="text-text">
                {report.aiOrigin.platformIdentification.platforms.map((p) => p.name).join(", ") ||
                  "none"}
              </span>
            </div>
            <div className="text-muted">
              {report.aiOrigin.aiFindings.length} AI-related ·{" "}
              {report.aiOrigin.templateFindings.length} template ·{" "}
              {report.aiOrigin.platformFindings.length} platform findings
            </div>
          </div>
        </Card>
      </div>
      <Card>
        <CardHeader
          title="Viewports"
          description="Real screenshots captured by the isolated browser."
        />
        <div className="grid gap-4 p-5 sm:grid-cols-3">
          {report.viewports.map((v) => (
            <figure key={v.id}>
              <img
                src={shots.url(v.screenshots.viewport)}
                alt={`${v.id} screenshot`}
                className="w-full rounded border border-border"
                loading="lazy"
              />
              <figcaption className="mt-2 text-xs text-muted">
                {v.id} {v.width}×{v.height} · document {v.documentWidth}×{v.documentHeight}
                {v.horizontalOverflow && <span className="text-warn"> · horizontal overflow</span>}
                <div className="text-faint">
                  {v.sampledElements} of {v.elementCount} elements measured · loaded in{" "}
                  {(v.loadMs / 1000).toFixed(1)} s
                </div>
                {shots.fullPage && v.screenshots.fullPage && (
                  <a
                    className="text-accent hover:underline"
                    href={shots.url(v.screenshots.fullPage)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Full-page screenshot{v.screenshots.fullPageTruncated ? " (truncated)" : ""}
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
  return (
    <Card>
      <CardHeader title={title} description={`${values.length} distinct measured values`} />
      {values.length === 0 ? (
        <div className="p-5">
          <Empty>None measured.</Empty>
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
  const d = report.design;
  const inspect = useInspect();
  const maxSpacing = Math.max(1, ...d.spacing.map((s) => s.count));
  return (
    <div className="space-y-5">
      <Callout>
        Values below are measured from computed styles. Only the “Inferred roles” card is
        interpretation; each role states its basis.
      </Callout>
      <Card>
        <CardHeader
          title="Colours"
          description="Distinct computed colours, normalised to sRGB hex. Click a swatch to see where it is used."
        />
        <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-4 lg:grid-cols-6">
          {d.colors.map((c) => (
            <button
              key={c.hex}
              className="group overflow-hidden rounded-md border border-border text-left hover:border-border-strong"
              onClick={() =>
                inspect({
                  title: `Colour ${c.hex}`,
                  subtitle: c.original ? `Computed as ${c.original}` : undefined,
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
        <CardHeader
          title="Inferred roles"
          description="Heuristic interpretations of the measured values above."
        />
        {d.roles.length === 0 ? (
          <div className="p-5">
            <Empty>No roles could be inferred.</Empty>
          </div>
        ) : (
          <Table head={["Role", "Value", "Confidence", "Basis", ""]}>
            {d.roles.map((r) => (
              <tr key={r.role}>
                <Td className="font-medium">{r.role}</Td>
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
                    {r.confidence}
                  </Badge>
                </Td>
                <Td className="text-muted">{r.basis}</Td>
                <Td>
                  <InspectButton title={`Role: ${r.role}`} refs={r.evidence} />
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Spacing"
            description={
              d.spacingBase
                ? `Inferred base unit ${d.spacingBase.basePx}px (${Math.round(d.spacingBase.share * 100)}% of values are multiples; ${d.spacingBase.confidence} confidence)`
                : "No consistent base unit inferred."
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
          title="Border radii"
          values={d.radii}
          render={(v) => (
            <span
              className="inline-block h-6 w-6 shrink-0 border border-border-strong bg-surface-2"
              style={{ borderRadius: v.value }}
            />
          )}
        />
        <ValueList
          title="Shadows"
          values={d.shadows}
          render={(v) => (
            <span
              className="inline-block h-6 w-6 shrink-0 rounded bg-surface"
              style={{ boxShadow: v.value }}
            />
          )}
        />
        <ValueList title="Borders" values={d.borders} />
      </div>
      <Card>
        <CardHeader
          title="Declared custom properties"
          description="Custom properties defined on :root/html in the site's CSS, with their original names."
        />
        {d.customProperties.length === 0 ? (
          <div className="p-5">
            <Empty>No custom properties found in inspected stylesheets.</Empty>
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            <Table head={["Name", "Value", "Selector", "Source"]}>
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
  const t = report.design.typography;
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Font families"
          description="First family of each computed font stack, weighted by measured text length."
        />
        <Table head={["Family", "Elements", "Text chars", "Full stack"]}>
          {t.families.map((f) => (
            <tr key={f.family}>
              <Td className="font-medium">
                <span style={{ fontFamily: f.stack }}>{f.family}</span>
              </Td>
              <Td className="tabular-nums">{f.count}</Td>
              <Td className="tabular-nums">{f.textChars.toLocaleString("en-US")}</Td>
              <Td>
                <Mono>{f.stack}</Mono>
              </Td>
            </tr>
          ))}
        </Table>
      </Card>
      <Card>
        <CardHeader
          title="Text styles"
          description={`Size scale: ${t.sizeScalePx.join(" · ")} px. Previews use your local fonts and may differ.`}
        />
        <ul className="divide-y divide-border">
          {t.styles.map((s, i) => (
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
                The quick brown fox
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
                  title={`Text style ${s.fontSize} ${s.fontWeight}`}
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
  return (
    <div className="space-y-5">
      <Callout>
        These are visual patterns detected from DOM structure and computed CSS. They do not identify
        which library or framework component produced them.
      </Callout>
      {report.components.length === 0 ? (
        <Empty>No component patterns detected.</Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {report.components.map((c, i) => (
            <Card key={i} className="p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold capitalize text-text">
                  {c.kind.replace("_", " ")}
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
                  {c.confidence}
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
                <InspectButton title={`${c.kind}: ${c.variant}`} refs={c.examples} />
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
  const l = report.layout;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Flex containers" value={String(l.flexContainers)} />
        <Stat label="Grid containers" value={String(l.gridContainers)} />
        <Stat
          label="Landmark elements"
          value={String(l.landmarks.reduce((n, x) => n + x.count, 0))}
        />
        <Stat label="Headings" value={String(l.headingOutline.reduce((n, x) => n + x.count, 0))} />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Grid patterns"
            description="Column counts of CSS grid containers (primary viewport)."
          />
          {l.gridPatterns.length === 0 ? (
            <div className="p-5">
              <Empty>No CSS grid containers.</Empty>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {l.gridPatterns.map((g) => (
                <li key={g.columns} className="flex items-center gap-3 px-5 py-2 text-sm">
                  <span className="text-text">
                    {g.columns} column{g.columns === 1 ? "" : "s"}
                  </span>
                  <span className="ml-auto text-xs text-muted">{g.count}×</span>
                  <InspectButton title={`${g.columns}-column grid`} refs={g.examples} />
                </li>
              ))}
            </ul>
          )}
        </Card>
        <ValueList title="Container max-widths" values={l.containerWidths} />
        <Card>
          <CardHeader title="Landmarks and roles" />
          <Table head={["Element", "Role", "Count"]}>
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
          <CardHeader title="Heading outline" />
          <div className="flex flex-wrap gap-2 p-5">
            {l.headingOutline.length === 0 ? (
              <Empty>No headings.</Empty>
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
  const r = report.responsive;
  const groups = new Map<string, typeof r.changes>();
  for (const c of r.changes)
    groups.set(`${c.from} → ${c.to}`, [...(groups.get(`${c.from} → ${c.to}`) ?? []), c]);
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        {report.viewports.map((v) => (
          <figure key={v.id} className="rounded-lg border border-border bg-surface p-2">
            <img
              src={shots.url(v.screenshots.viewport)}
              alt={`${v.id} screenshot`}
              className="w-full rounded"
              loading="lazy"
            />
            <figcaption className="mt-2 px-1 text-xs text-muted">
              {v.id} · {v.width}px · document {v.documentWidth}px wide
              {v.horizontalOverflow && <span className="text-warn"> (overflow)</span>}
            </figcaption>
          </figure>
        ))}
      </div>
      <Callout>
        Most differences are intentional responsive design and are shown as informational. Only
        horizontal overflow and very small mobile text are marked as potential issues.
      </Callout>
      <div className="text-sm text-muted">
        Breakpoints declared in inspected CSS:{" "}
        {r.breakpointsDeclared.length
          ? r.breakpointsDeclared.map((b) => `${b}px`).join(", ")
          : "none found"}
      </div>
      {r.notes.map((n) => (
        <Callout key={n}>{n}</Callout>
      ))}
      {[...groups.entries()].map(([pair, changes]) => (
        <Card key={pair}>
          <CardHeader title={pair} description={`${changes.length} observed difference(s)`} />
          <Table head={["Kind", "Change", "Before", "After", "Element"]}>
            {changes.map((c, i) => (
              <tr key={i}>
                <Td>
                  <Badge tone={c.severity === "potential_issue" ? "warn" : "neutral"}>
                    {c.kind.replace("_", " ")}
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
      {r.changes.length === 0 && (
        <Empty>No differences were recorded between the captured viewports.</Empty>
      )}
    </div>
  );
}

// ---------------- Source analysis ----------------

export function SourceSection({ report }: { report: Report }) {
  const s = report.source;
  const frameworks = report.aiOrigin.platformFindings;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="HTML"
          value={s.html.inspected ? `${(s.html.bytes / 1024).toFixed(1)} KB` : "not inspected"}
          hint={`${s.html.commentCount} comments`}
        />
        <Stat
          label="CSS files"
          value={String(s.css.filesInspected)}
          hint={`${s.css.ruleCount.toLocaleString("en-US")} rules`}
        />
        <Stat
          label="JS files"
          value={String(s.js.filesInspected)}
          hint={`${s.js.parsed} parsed · ${s.js.minifiedLikely} minified`}
        />
        <Stat
          label="Source maps"
          value={String(s.js.sourceMaps.filter((m) => m.status === "parsed").length)}
          hint={`${s.js.sourceMaps.length} referenced`}
        />
      </div>
      <Card>
        <CardHeader
          title="Frameworks, libraries and build tools"
          description="Directly observed fingerprints (from the platform detectors), with their evidence."
        />
        {frameworks.length === 0 ? (
          <div className="p-5">
            <Empty>No framework or build-tool fingerprint matched.</Empty>
          </div>
        ) : (
          <Table head={["Subject", "Type", "Strength", "Evidence"]}>
            {frameworks.map((f) => (
              <tr key={f.id}>
                <Td className="font-medium">{f.subject}</Td>
                <Td className="text-muted">{f.subjectType?.replace("_", " ")}</Td>
                <Td>
                  <Badge>{f.evidenceStrength}</Badge>
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
          <CardHeader title="HTML observations" />
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 px-5 py-4 text-sm">
            <dt className="text-muted">Server-rendered text</dt>
            <dd className="text-text">
              {s.html.serverRenderedContent ? "yes" : "little or none (client-rendered)"}
            </dd>
            <dt className="text-muted">Scripts</dt>
            <dd className="text-text">
              {s.html.externalScripts} external · {s.html.inlineScripts} inline
            </dd>
            <dt className="text-muted">Stylesheets</dt>
            <dd className="text-text">
              {s.html.externalStylesheets} external · {s.html.inlineStyles} inline
            </dd>
            <dt className="text-muted">Generator meta</dt>
            <dd className="text-text">{s.html.generatorMeta.join(", ") || "none"}</dd>
            <dt className="text-muted">data-* prefixes</dt>
            <dd className="text-text">
              {s.html.dataAttributePrefixes.map((d) => `${d.prefix} (${d.count})`).join(", ") ||
                "none"}
            </dd>
          </dl>
          {s.html.notableComments.length > 0 && (
            <div className="border-t border-border px-5 py-3">
              <div className="mb-2 text-xs text-muted">
                HTML comments (truncated, secrets redacted)
              </div>
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
          <CardHeader title="CSS observations" />
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 px-5 py-4 text-sm">
            <dt className="text-muted">Custom properties</dt>
            <dd className="text-text">{s.css.customPropertyCount}</dd>
            <dt className="text-muted">Breakpoints</dt>
            <dd className="text-text">
              {s.css.breakpointsPx.map((b) => `${b}px`).join(", ") || "none"}
            </dd>
            <dt className="text-muted">@font-face</dt>
            <dd className="text-text">{s.css.fontFaces.join(", ") || "none"}</dd>
            <dt className="text-muted">Parse errors</dt>
            <dd className="text-text">{s.css.parseErrors}</dd>
          </dl>
          <div className="border-t border-border px-5 py-3">
            <div className="mb-2 text-xs text-muted">Class naming conventions (rendered DOM)</div>
            {s.css.namingConventions.length === 0 ? (
              <p className="text-sm text-muted">No dominant convention detected.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {s.css.namingConventions.map((n) => (
                  <li key={n.convention}>
                    <span className="text-text">{n.convention}</span>{" "}
                    <span className="text-muted">
                      — {Math.round(n.share * 100)}% of class tokens, {n.confidence}
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
          <CardHeader
            title="JavaScript observations"
            description="Parsed with acorn as data; never executed outside the isolated browser."
          />
          <div className="space-y-3 px-5 py-4 text-sm">
            <div className="text-muted">
              {s.js.moduleScripts} ES module(s) · {s.js.parseFailures} parse failure(s) ·{" "}
              {(s.js.totalBytes / 1024).toFixed(0)} KB total
            </div>
            <div>
              <div className="mb-1 text-xs text-muted">Bundler signatures</div>
              {s.js.bundlerSignatures.length === 0 ? (
                <span className="text-muted">none detected</span>
              ) : (
                s.js.bundlerSignatures.map((b) => (
                  <Badge key={b.name} className="mr-1">
                    {b.name}
                  </Badge>
                ))
              )}
            </div>
            <div>
              <div className="mb-1 text-xs text-muted">Library banners</div>
              {s.js.libraryBanners.length === 0 ? (
                <span className="text-muted">none preserved</span>
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
                <div className="mb-1 text-xs text-muted">
                  Source maps (paths only; contents are never stored)
                </div>
                <ul className="space-y-1 text-xs">
                  {s.js.sourceMaps.map((m, i) => (
                    <li key={i}>
                      <Badge tone={m.status === "parsed" ? "accent" : "neutral"}>{m.status}</Badge>{" "}
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
          <CardHeader
            title="Source ↔ runtime correlation"
            description="Whether source-level evidence agrees with what the browser rendered."
          />
          {s.correlations.length === 0 ? (
            <div className="p-5">
              <Empty>No correlations computed.</Empty>
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
                      {c.status}
                    </Badge>
                  </div>
                  <div className="mt-1 break-all text-xs text-muted">
                    Source: {c.sourceEvidence}
                  </div>
                  <div className="break-all text-xs text-muted">Runtime: {c.runtimeEvidence}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      {s.notInspected.length > 0 && (
        <Card>
          <CardHeader title="Files that could not be inspected" />
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
        <CardHeader title="Limitations of this source analysis" />
        <ul className="list-disc space-y-1 px-9 py-4 text-sm text-muted">
          {s.limitations.map((l) => (
            <li key={l}>{l}</li>
          ))}
          {s.redactedSecrets > 0 && (
            <li>
              {s.redactedSecrets} value(s) that looked like credentials were redacted from snippets.
            </li>
          )}
        </ul>
      </Card>
    </div>
  );
}

// ---------------- Accessibility ----------------

export function AccessibilitySection({ report }: { report: Report }) {
  const a = report.accessibility;
  return (
    <div className="space-y-5">
      <Callout>
        {a.note} Checks run: {a.checksRun.join(", ")}.
      </Callout>
      {a.issues.length === 0 ? (
        <Empty>The automated checks found no issues. Manual testing is still required.</Empty>
      ) : (
        <Card>
          <Table head={["Severity", "Check", "Observation", "Count", ""]}>
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
                    {i.severity}
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
  const a = report.assets;
  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title={`Images (${a.images.length})`}
            description="Metadata only; images are not downloaded or redistributed."
          />
          <div className="max-h-96 overflow-y-auto">
            <Table head={["Source", "Natural", "Rendered", "Alt"]}>
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
                  <Td>{img.hasAlt ? <Badge>yes</Badge> : <Badge tone="warn">missing</Badge>}</Td>
                </tr>
              ))}
            </Table>
          </div>
        </Card>
        <Card>
          <CardHeader
            title="Fonts loaded"
            description="From document.fonts in the rendered page."
          />
          {a.fonts.length === 0 ? (
            <div className="p-5">
              <Empty>No web fonts loaded.</Empty>
            </div>
          ) : (
            <Table head={["Family", "Weight", "Style", "Status"]}>
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
            title={`${kind === "scripts" ? "Scripts" : "Stylesheets"} (${a[kind].length})`}
          />
          <div className="max-h-96 overflow-y-auto">
            <Table head={["URL", "Status", "Size", "Party", "Inspected"]}>
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
                      <Badge tone="outline">third-party</Badge>
                    ) : (
                      <Badge>first-party</Badge>
                    )}
                  </Td>
                  <Td className="text-xs text-muted">
                    {r.inspected ? "yes" : (r.notInspectedReason ?? "no")}
                  </Td>
                </tr>
              ))}
            </Table>
          </div>
        </Card>
      ))}
      <Card className="p-5 text-sm">
        <div className="text-muted">
          Third-party domains contacted ({a.thirdPartyDomains.length}). First/third-party is
          approximated by the last two labels of the hostname.
        </div>
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

const EXPORTS = [
  {
    format: "json",
    title: "JSON report",
    text: "The complete versioned report: measurements, inferred findings, evidence, warnings and detector versions.",
  },
  {
    format: "css",
    title: "CSS variables",
    text: "Custom properties with values measured from the page, plus the site's own declared properties.",
  },
  {
    format: "tailwind",
    title: "Tailwind v4 theme",
    text: "An @theme block for Tailwind CSS v4 (colours, fonts, text sizes, radii, shadows).",
  },
  {
    format: "markdown",
    title: "Markdown report",
    text: "A readable summary including AI-origin evidence and limitations.",
  },
  {
    format: "evidence",
    title: "Evidence bundle (.zip)",
    text: "The JSON report and WebDNA's screenshots. No third-party page assets are included.",
  },
];

export function ExportSection({
  scanId,
  exportHref,
}: {
  scanId?: string;
  exportHref?: (format: string) => string;
}) {
  return (
    <div className="space-y-5">
      {!scanId && (
        <Callout tone="warn">
          Exports are generated by the server for real scans. The bundled sample report cannot be
          exported here.
        </Callout>
      )}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {EXPORTS.map((e) => (
          <Card key={e.format} className="flex flex-col p-5">
            <h3 className="text-sm font-semibold text-text">{e.title}</h3>
            <p className="mt-1 flex-1 text-sm text-muted">{e.text}</p>
            {scanId && exportHref && (
              <LinkButton className="mt-4 self-start" href={exportHref(e.format)} download>
                <Download size={14} /> Download
              </LinkButton>
            )}
          </Card>
        ))}
      </div>
      <p className="text-xs text-faint">
        Screenshots show a third-party website. Check its terms and any personal information before
        sharing them.
      </p>
    </div>
  );
}
