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
import { useI18n } from "@/i18n/client";
import { fromEvidenceRefs, useInspect } from "./inspector";

function FindingRow({ f }: { f: Finding }) {
  const inspect = useInspect();
  const { t, tEnum } = useI18n();
  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-text">{f.finding}</span>
        <StrengthBadge
          strength={f.evidenceStrength}
          label={tEnum("strength", f.evidenceStrength)}
          title={t("strength.title")}
        />
        <Badge tone="outline">{tEnum("kind", f.evidenceKind)}</Badge>
        {f.experimental && <Badge tone="warn">{t("ai.experimental")}</Badge>}
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
          <Search size={12} /> {t("ai.inspect")}
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
  const { t, tEnum, formatNumber } = useI18n();
  const ai = report.aiOrigin;
  const cov = ai.coverage;
  return (
    <div className="space-y-5">
      <Card className="p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-faint">{t("ai.overall")}</div>
            <div className="mt-2 flex items-center gap-2">
              <Badge tone={conclusionTone(ai.conclusion)} className="px-2 py-1 text-sm">
                {tEnum("conclusion", ai.conclusion)}
              </Badge>
            </div>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted">
              {ai.rationale.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
          <div className="min-w-0 text-xs text-faint sm:max-w-[45%] sm:text-right">
            {t("common.ruleSet")}
            <div className="mt-1">
              <Mono>{ai.ruleSetVersion}</Mono>
            </div>
          </div>
        </div>
        <div className="mt-4">
          <Callout icon={<Info size={15} />}>{t("ai.disclaimer")}</Callout>
        </div>
      </Card>

      {ai.conflicts.length > 0 && (
        <Callout tone="warn" icon={<Info size={15} />}>
          <div className="font-medium">{t("ai.conflicts")}</div>
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
                <Layers size={15} className="text-muted" /> {t("ai.a.title")}
              </span>
            }
            description={t("ai.a.desc")}
          />
          {ai.platformIdentification.platforms.length === 0 ? (
            <div className="p-5">
              <Empty>{t("ai.a.none")}</Empty>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 px-5 pt-4">
              {ai.platformIdentification.platforms.map((p) => (
                <Badge key={p.name} tone={p.type === "ai_builder" ? "info" : "neutral"}>
                  {p.name} · {tEnum("subject", p.type)} · {tEnum("strength", p.strength)}
                </Badge>
              ))}
            </div>
          )}
          {ai.platformFindings.length > 0 && (
            <FindingList findings={ai.platformFindings} empty={t("ai.a.noFindings")} />
          )}
        </Card>

        <Card>
          <CardHeader
            title={
              <span className="inline-flex items-center gap-2">
                <Sparkles size={15} className="text-muted" /> {t("ai.b.title")}
              </span>
            }
            description={t("ai.b.desc")}
          />
          <FindingList
            findings={ai.aiFindings}
            empty={
              ai.conclusion === "insufficient_evidence" ? t("ai.b.insufficient") : t("ai.b.none")
            }
          />
        </Card>
      </div>

      <Card>
        <CardHeader title={t("ai.c.title")} description={t("ai.c.desc")} />
        <FindingList findings={ai.templateFindings} empty={t("ai.c.none")} />
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("ai.coverage")} description={t("ai.coverage.desc")} />
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 px-5 py-4 text-sm">
            <dt className="text-muted">{t("ai.cov.html")}</dt>
            <dd className="text-text">
              {cov.htmlInspected ? t("common.inspected") : t("common.unavailable")}
            </dd>
            <dt className="text-muted">{t("ai.cov.dom")}</dt>
            <dd className="text-text">
              {cov.renderedDomInspected ? t("common.inspected") : t("common.unavailable")}
            </dd>
            <dt className="text-muted">{t("ai.cov.scripts")}</dt>
            <dd className="text-text">
              {cov.scriptsInspected} / {cov.scriptsTotal}
            </dd>
            <dt className="text-muted">{t("ai.cov.styles")}</dt>
            <dd className="text-text">
              {cov.stylesheetsInspected} / {cov.stylesheetsTotal}
            </dd>
            <dt className="text-muted">{t("ai.cov.text")}</dt>
            <dd className="text-text">
              {t("ai.cov.textValue", { n: formatNumber(cov.visibleTextChars) })}
            </dd>
            <dt className="text-muted">{t("ai.cov.headers")}</dt>
            <dd className="text-text">
              {cov.headersInspected ? t("common.inspected") : t("common.unavailable")}
            </dd>
            <dt className="text-muted">{t("ai.cov.blocking")}</dt>
            <dd className="text-text">
              {cov.blockingPageSuspected ? t("common.yes") : t("common.no")}
            </dd>
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
          <CardHeader title={t("ai.detectorsRan")} description={t("ai.detectorsRan.desc")} />
          <div className="max-h-80 overflow-y-auto">
            <Table
              head={[
                t("ai.head.detector"),
                t("ai.head.version"),
                t("ai.head.status"),
                t("ai.head.findings"),
              ]}
            >
              {ai.detectors.map((d) => (
                <tr key={d.id}>
                  <Td>
                    <Mono>{d.id}</Mono>
                  </Td>
                  <Td className="tabular-nums">{d.version}</Td>
                  <Td>
                    {d.error ? (
                      <Badge tone="danger">{t("ai.error")}</Badge>
                    ) : (
                      <Badge tone={d.status === "active" ? "neutral" : "warn"}>
                        {tEnum("detStatus", d.status)}
                      </Badge>
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
