"use client";

import { AlertTriangle } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import type { ReportComparison, ScanRecord, ValueDiff } from "@webdna/shared";
import { Badge, Callout, Card, CardHeader, Empty, Mono, Table, Td } from "@/components/ui";
import { api, ApiError, formatDate } from "@/lib/api";

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
  const [scans, setScans] = useState<ScanRecord[]>([]);
  const [a, setA] = useState(params.get("a") ?? "");
  const [b, setB] = useState(params.get("b") ?? "");
  const [cmp, setCmp] = useState<ReportComparison>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    api
      .listScans(200)
      .then(({ scans }) => setScans(scans.filter((s) => s.status === "completed")))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load scans."));
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
      .catch((e) => setError(e instanceof ApiError ? e.message : "Comparison failed."));
  }, [a, b]);

  const option = (s: ScanRecord) => (
    <option key={s.id} value={s.id}>
      {s.domain} — {formatDate(s.createdAt)}
    </option>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text">Compare scans</h1>
        <p className="mt-1 text-sm text-muted">
          Compare design tokens, components, responsive behaviour and AI-origin findings between two
          completed scans.
        </p>
      </div>
      <Card className="grid gap-4 p-5 md:grid-cols-2">
        {[
          ["Scan A (before)", a, setA],
          ["Scan B (after)", b, setB],
        ].map(([label, value, set]) => (
          <label key={label as string} className="text-sm">
            <span className="text-muted">{label as string}</span>
            <select
              value={value as string}
              onChange={(e) => (set as (v: string) => void)(e.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-border-strong bg-surface px-2 text-sm text-text"
            >
              <option value="">Select a completed scan…</option>
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
      {!cmp && !error && (
        <Empty>
          {scans.length < 2
            ? "At least two completed scans are needed."
            : "Choose two scans to compare."}
        </Empty>
      )}
      {cmp && (
        <>
          {cmp.notes.map((n) => (
            <Callout key={n} tone="warn" icon={<AlertTriangle size={15} />}>
              {n}
            </Callout>
          ))}
          <Card>
            <CardHeader
              title="Detector versions"
              description="A changed finding can come from a changed rule rather than a changed website."
            />
            <div className="space-y-2 px-5 py-4 text-sm">
              <div>
                A: <Mono>{cmp.a.ruleSetVersion}</Mono>
              </div>
              <div>
                B: <Mono>{cmp.b.ruleSetVersion}</Mono>
              </div>
              {cmp.detectorVersionChanges.length === 0 ? (
                <p className="text-muted">All detectors ran at the same versions.</p>
              ) : (
                <ul className="list-disc pl-5 text-muted">
                  {cmp.detectorVersionChanges.map((d) => (
                    <li key={d.id}>
                      <Mono>{d.id}</Mono>: {d.a ?? "absent"} → {d.b ?? "absent"}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
          <Card>
            <CardHeader title="Design tokens" />
            <Table head={["Token type", "Added in B", "Removed in B", "Unchanged"]}>
              <DiffRow label="Colours" diff={cmp.colors} swatch />
              <DiffRow label="Font families" diff={cmp.fontFamilies} />
              <DiffRow label="Font sizes (px)" diff={cmp.fontSizes} />
              <DiffRow label="Spacing" diff={cmp.spacing} />
              <DiffRow label="Radii" diff={cmp.radii} />
              <DiffRow label="Shadows" diff={cmp.shadows} />
            </Table>
          </Card>
          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader title="Components" />
              <Table head={["Pattern", "A", "B"]}>
                {cmp.components.map((c) => (
                  <tr key={c.kind}>
                    <Td className="capitalize">{c.kind.replace("_", " ")}</Td>
                    <Td className="tabular-nums">{c.a}</Td>
                    <Td className={c.a !== c.b ? "tabular-nums font-semibold" : "tabular-nums"}>
                      {c.b}
                    </Td>
                  </tr>
                ))}
              </Table>
            </Card>
            <Card>
              <CardHeader title="Responsive" />
              <div className="space-y-2 px-5 py-4 text-sm text-muted">
                <div>
                  Recorded differences: A {cmp.responsive.a} · B {cmp.responsive.b}
                </div>
                <div>Overflow in A: {cmp.responsive.overflowA.join("; ") || "none"}</div>
                <div>Overflow in B: {cmp.responsive.overflowB.join("; ") || "none"}</div>
              </div>
            </Card>
          </div>
          <Card>
            <CardHeader title="AI-origin findings" />
            <div className="space-y-3 px-5 py-4 text-sm">
              <div className="flex flex-wrap gap-2">
                <Badge>A: {cmp.aiOrigin.conclusionA}</Badge>
                <Badge>B: {cmp.aiOrigin.conclusionB}</Badge>
              </div>
              {cmp.aiOrigin.findingsAdded.length + cmp.aiOrigin.findingsRemoved.length === 0 && (
                <p className="text-muted">Same findings in both scans.</p>
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
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <CompareInner />
    </Suspense>
  );
}
