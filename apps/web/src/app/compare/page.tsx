"use client";

import { AlertTriangle } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import {
  AI_CONCLUSION_LABELS,
  type ReportComparison,
  type ScanRecord,
  type ValueDiff,
} from "@webdna/shared";
import { Badge, Callout, Card, CardHeader, Empty, Mono, Table, Td } from "@/components/ui";
import { useI18n } from "@/i18n/client";
import { api, ApiError, localizeError } from "@/lib/api";

/** The comparison carries English conclusion labels; map them back to their keys to translate. */
const CONCLUSION_BY_LABEL = Object.fromEntries(
  Object.entries(AI_CONCLUSION_LABELS).map(([k, v]) => [v, k]),
) as Record<string, string>;

function DiffRow({
  label,
  diff,
  swatch = false,
}: {
  label: string;
  diff: ValueDiff;
  swatch?: boolean;
}) {
  const chip = (v: string, tone: "accent" | "danger") => (
    <span
      key={v}
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-xs ${tone === "accent" ? "bg-accent-soft text-accent" : "bg-danger-soft text-danger"}`}
    >
      {swatch && (
        <span
          className="inline-block h-3 w-3 rounded-sm border border-border"
          style={{ background: v }}
        />
      )}
      {tone === "accent" ? "+" : "−"} {v}
    </span>
  );
  return (
    <tr>
      <Td className="font-medium">{label}</Td>
      <Td>
        <div className="flex flex-wrap gap-1">
          {diff.added.length ? (
            diff.added.map((v) => chip(v, "accent"))
          ) : (
            <span className="text-muted">—</span>
          )}
        </div>
      </Td>
      <Td>
        <div className="flex flex-wrap gap-1">
          {diff.removed.length ? (
            diff.removed.map((v) => chip(v, "danger"))
          ) : (
            <span className="text-muted">—</span>
          )}
        </div>
      </Td>
      <Td className="tabular-nums text-muted">{diff.unchanged}</Td>
    </tr>
  );
}

function CompareInner() {
  const params = useSearchParams();
  const i18n = useI18n();
  const { t, tEnum, formatDate } = i18n;
  const conclusion = (label: string) =>
    CONCLUSION_BY_LABEL[label] ? tEnum("conclusion", CONCLUSION_BY_LABEL[label]) : label;
  const [scans, setScans] = useState<ScanRecord[]>([]);
  const [a, setA] = useState(params.get("a") ?? "");
  const [b, setB] = useState(params.get("b") ?? "");
  const [cmp, setCmp] = useState<ReportComparison>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    api
      .listScans(200)
      .then(({ scans }) => setScans(scans.filter((s) => s.status === "completed")))
      .catch((e) =>
        setError(e instanceof ApiError ? localizeError(e, i18n) : t("dash.loadFailed")),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setCmp(undefined);
    if (!a || !b) return;
    api
      .compare(a, b)
      .then(({ comparison }) => {
        setCmp(comparison);
        setError(undefined);
      })
      .catch((e) => setError(e instanceof ApiError ? localizeError(e, i18n) : t("cmp.failed")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a, b]);

  const option = (s: ScanRecord) => (
    <option key={s.id} value={s.id}>
      {s.domain} — {formatDate(s.createdAt)}
    </option>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text">{t("cmp.title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("cmp.subtitle")}</p>
      </div>
      <Card className="grid gap-4 p-5 md:grid-cols-2">
        {[
          [t("cmp.a"), a, setA],
          [t("cmp.b"), b, setB],
        ].map(([label, value, set]) => (
          <label key={label as string} className="text-sm">
            <span className="text-muted">{label as string}</span>
            <select
              value={value as string}
              onChange={(e) => (set as (v: string) => void)(e.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-border-strong bg-surface px-2 text-sm text-text"
            >
              <option value="">{t("cmp.select")}</option>
              {scans.map(option)}
            </select>
          </label>
        ))}
      </Card>
      {error && (
        <Callout tone="warn" icon={<AlertTriangle size={15} />}>
          {error}
        </Callout>
      )}
      {!cmp && !error && <Empty>{scans.length < 2 ? t("cmp.needTwo") : t("cmp.choose")}</Empty>}
      {cmp && (
        <>
          {cmp.notes.map((n) => (
            <Callout key={n} tone="warn" icon={<AlertTriangle size={15} />}>
              {n}
            </Callout>
          ))}
          <Card>
            <CardHeader title={t("cmp.versions")} description={t("cmp.versionsNote")} />
            <div className="space-y-2 px-5 py-4 text-sm">
              <div>
                A: <Mono>{cmp.a.ruleSetVersion}</Mono>
              </div>
              <div>
                B: <Mono>{cmp.b.ruleSetVersion}</Mono>
              </div>
              {cmp.detectorVersionChanges.length === 0 ? (
                <p className="text-muted">{t("cmp.sameVersions")}</p>
              ) : (
                <ul className="list-disc pl-5 text-muted">
                  {cmp.detectorVersionChanges.map((d) => (
                    <li key={d.id}>
                      <Mono>{d.id}</Mono>: {d.a ?? t("cmp.absent")} → {d.b ?? t("cmp.absent")}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
          <Card>
            <CardHeader title={t("cmp.tokens")} />
            <Table
              head={[
                t("cmp.head.type"),
                t("cmp.head.added"),
                t("cmp.head.removed"),
                t("cmp.head.unchanged"),
              ]}
            >
              <DiffRow label={t("cmp.row.colors")} diff={cmp.colors} swatch />
              <DiffRow label={t("cmp.row.families")} diff={cmp.fontFamilies} />
              <DiffRow label={t("cmp.row.sizes")} diff={cmp.fontSizes} />
              <DiffRow label={t("cmp.row.spacing")} diff={cmp.spacing} />
              <DiffRow label={t("cmp.row.radii")} diff={cmp.radii} />
              <DiffRow label={t("cmp.row.shadows")} diff={cmp.shadows} />
            </Table>
          </Card>
          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader title={t("cmp.components")} />
              <Table head={[t("cmp.pattern"), "A", "B"]}>
                {cmp.components.map((c) => (
                  <tr key={c.kind}>
                    <Td className="capitalize">{tEnum("ckind", c.kind)}</Td>
                    <Td className="tabular-nums">{c.a}</Td>
                    <Td className={c.a !== c.b ? "tabular-nums font-semibold" : "tabular-nums"}>
                      {c.b}
                    </Td>
                  </tr>
                ))}
              </Table>
            </Card>
            <Card>
              <CardHeader title={t("cmp.responsive")} />
              <div className="space-y-2 px-5 py-4 text-sm text-muted">
                <div>{t("cmp.recorded", { a: cmp.responsive.a, b: cmp.responsive.b })}</div>
                <div>
                  {t("cmp.overflowA", {
                    v: cmp.responsive.overflowA.join("; ") || t("common.none"),
                  })}
                </div>
                <div>
                  {t("cmp.overflowB", {
                    v: cmp.responsive.overflowB.join("; ") || t("common.none"),
                  })}
                </div>
              </div>
            </Card>
          </div>
          <Card>
            <CardHeader title={t("cmp.ai")} />
            <div className="space-y-3 px-5 py-4 text-sm">
              <div className="flex flex-wrap gap-2">
                <Badge>A: {conclusion(cmp.aiOrigin.conclusionA)}</Badge>
                <Badge>B: {conclusion(cmp.aiOrigin.conclusionB)}</Badge>
              </div>
              {cmp.aiOrigin.findingsAdded.length + cmp.aiOrigin.findingsRemoved.length === 0 && (
                <p className="text-muted">{t("cmp.sameFindings")}</p>
              )}
              {cmp.aiOrigin.findingsAdded.map((f) => (
                <div key={f.key} className="text-text">
                  <span className="text-accent">+</span> {f.finding}{" "}
                  <span className="text-xs text-muted">({f.cause})</span>
                </div>
              ))}
              {cmp.aiOrigin.findingsRemoved.map((f) => (
                <div key={f.key} className="text-text">
                  <span className="text-danger">−</span> {f.finding}{" "}
                  <span className="text-xs text-muted">({f.cause})</span>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">…</p>}>
      <CompareInner />
    </Suspense>
  );
}
