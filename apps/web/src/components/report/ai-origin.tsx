"use client";

import { Info, Layers, Search, Sparkles } from "lucide-react";
import type { Finding, Report } from "@webdna/shared";
import {
  Badge,
  Callout,
  Card,
  CardHeader,
  Empty,
  Mono,
  StrengthBadge,
  Table,
  Td,
  conclusionTone,
} from "../ui";
import { fromEvidenceRefs, useInspect } from "./inspector";

function FindingRow({ f }: { f: Finding }) {
  const inspect = useInspect();
  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-text">{f.finding}</span>
        <StrengthBadge strength={f.evidenceStrength} />
        <Badge tone="outline">{f.evidenceKind}</Badge>
        {f.experimental && <Badge tone="warn">experimental</Badge>}
      </div>
      <p className="mt-1.5 text-sm text-muted">{f.explanation}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-faint">
        {f.evidence.slice(0, 2).map((e, i) => (
          <Mono key={i} className="max-w-full truncate">
            {e.type}: {e.value ?? e.location}
          </Mono>
        ))}
        <button
          className="inline-flex items-center gap-1 text-accent hover:underline"
          onClick={() =>
            inspect({
              title: f.finding,
              subtitle: f.subject,
              items: fromEvidenceRefs(f.evidence),
              finding: f,
            })
          }
        >
          <Search size={12} /> Inspect evidence
        </button>
      </div>
    </li>
  );
}

function FindingList({ findings, empty }: { findings: Finding[]; empty: string }) {
  if (findings.length === 0)
    return (
      <div className="p-5">
        <Empty>{empty}</Empty>
      </div>
    );
  return (
    <ul className="divide-y divide-border">
      {findings.map((f) => (
        <FindingRow key={f.id} f={f} />
      ))}
    </ul>
  );
}

export function AiOriginSection({ report }: { report: Report }) {
  const ai = report.aiOrigin;
  const cov = ai.coverage;
  return (
    <div className="space-y-5">
      <Card className="p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-faint">
              Overall evidence category
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Badge tone={conclusionTone(ai.conclusion)} className="px-2 py-1 text-sm">
                {ai.conclusionLabel}
              </Badge>
            </div>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted">
              {ai.rationale.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
          <div className="shrink-0 text-xs text-faint sm:text-right">
            Rule set
            <div className="mt-1">
              <Mono>{ai.ruleSetVersion}</Mono>
            </div>
          </div>
        </div>
        <div className="mt-4">
          <Callout icon={<Info size={15} />}>{ai.disclaimer}</Callout>
        </div>
      </Card>

      {ai.conflicts.length > 0 && (
        <Callout tone="warn" icon={<Info size={15} />}>
          <div className="font-medium">Conflicting evidence</div>
          <ul className="mt-1 list-disc pl-4">
            {ai.conflicts.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </Callout>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title={
              <span className="inline-flex items-center gap-2">
                <Layers size={15} className="text-muted" /> A. Website platform identified
              </span>
            }
            description="CMS, framework, website-builder, hosting and build-tool fingerprints. Platform identification is not evidence of AI use."
          />
          {ai.platformIdentification.platforms.length === 0 ? (
            <div className="p-5">
              <Empty>No platform could be identified from the available evidence.</Empty>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 px-5 pt-4">
              {ai.platformIdentification.platforms.map((p) => (
                <Badge key={p.name} tone={p.type === "ai_builder" ? "info" : "neutral"}>
                  {p.name} · {p.type.replace("_", " ")} · {p.strength}
                </Badge>
              ))}
            </div>
          )}
          {ai.platformFindings.length > 0 && (
            <FindingList findings={ai.platformFindings} empty="No platform findings." />
          )}
        </Card>

        <Card>
          <CardHeader
            title={
              <span className="inline-flex items-center gap-2">
                <Sparkles size={15} className="text-muted" /> B. Evidence potentially associated
                with AI-assisted generation
              </span>
            }
            description="Explicit AI-builder markers and self-declared generator claims. Never inferred from visual style."
          />
          <FindingList
            findings={ai.aiFindings}
            empty={
              ai.conclusion === "insufficient_evidence"
                ? "Not enough evidence was available to evaluate this question."
                : "No AI-related indicators were found. This does not show that no AI tools were used."
            }
          />
        </Card>
      </div>

      <Card>
        <CardHeader
          title="C. Template and boilerplate signals"
          description="Unchanged starter content, placeholders and unreplaced variables. Reuse or incomplete customisation is not AI involvement."
        />
        <FindingList
          findings={ai.templateFindings}
          empty="No template or placeholder signals were found."
        />
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Evidence coverage"
            description="What the detectors could actually look at."
          />
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 px-5 py-4 text-sm">
            <dt className="text-muted">Original HTML</dt>
            <dd className="text-text">{cov.htmlInspected ? "inspected" : "unavailable"}</dd>
            <dt className="text-muted">Rendered DOM</dt>
            <dd className="text-text">{cov.renderedDomInspected ? "inspected" : "unavailable"}</dd>
            <dt className="text-muted">Scripts</dt>
            <dd className="text-text">
              {cov.scriptsInspected} / {cov.scriptsTotal}
            </dd>
            <dt className="text-muted">Stylesheets</dt>
            <dd className="text-text">
              {cov.stylesheetsInspected} / {cov.stylesheetsTotal}
            </dd>
            <dt className="text-muted">Visible text sampled</dt>
            <dd className="text-text">
              {cov.visibleTextChars.toLocaleString("en-US")} chars (not stored)
            </dd>
            <dt className="text-muted">Response headers</dt>
            <dd className="text-text">{cov.headersInspected ? "inspected" : "unavailable"}</dd>
            <dt className="text-muted">Blocking page suspected</dt>
            <dd className="text-text">{cov.blockingPageSuspected ? "yes" : "no"}</dd>
          </dl>
          {cov.notes.length > 0 && (
            <ul className="list-disc space-y-1 border-t border-border px-9 py-3 text-xs text-muted">
              {cov.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader
            title="Detectors that ran"
            description="Versions recorded so later comparisons can tell rule changes from site changes."
          />
          <div className="max-h-80 overflow-y-auto">
            <Table head={["Detector", "Version", "Status", "Findings"]}>
              {ai.detectors.map((d) => (
                <tr key={d.id}>
                  <Td>
                    <Mono>{d.id}</Mono>
                  </Td>
                  <Td className="tabular-nums">{d.version}</Td>
                  <Td>
                    {d.error ? (
                      <Badge tone="danger">error</Badge>
                    ) : (
                      <Badge tone={d.status === "active" ? "neutral" : "warn"}>{d.status}</Badge>
                    )}
                  </Td>
                  <Td className="tabular-nums">{d.findingCount}</Td>
                </tr>
              ))}
            </Table>
          </div>
        </Card>
      </div>
    </div>
  );
}
