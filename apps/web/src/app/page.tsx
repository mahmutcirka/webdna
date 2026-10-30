import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { AiConclusion, Report } from "@webdna/shared";
import { DnaStrip } from "@/components/dna-strip";
import { UrlForm } from "@/components/url-form";
import { Badge } from "@/components/ui";
import type { MessageKey } from "@/i18n/messages";
import { getTranslator } from "@/i18n/server";
import sample from "@/sample/sample-report.json";

const report = sample as unknown as Report;

const FEATURES = ["f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8", "f9"] as const;

/** Graded from no evidence to strong; "insufficient" sits apart because it is not a grade. */
const SCALE: { c: AiConclusion; fill: string }[] = [
  { c: "no_meaningful_evidence", fill: "bg-surface" },
  { c: "weak_or_ambiguous", fill: "bg-text/15" },
  { c: "some_ai_indicators", fill: "bg-text/45" },
  { c: "strong_ai_evidence", fill: "bg-text" },
];

const pad = (n: number) => String(n).padStart(2, "0");

function SpecimenSheet({ t }: { t: Awaited<ReturnType<typeof getTranslator>>["t"] }) {
  const d = report.design;
  const headingFamily = d.roles.find((r) => r.role === "heading font")?.value;
  const headingStack =
    d.typography.families.find((f) => f.family === headingFamily)?.stack ?? "Georgia, serif";
  const sizes = [...d.typography.sizeScalePx].sort((a, b) => b - a).slice(0, 6);
  const spacing = d.spacing
    .filter((s): s is typeof s & { px: number } => typeof s.px === "number")
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)
    .sort((a, b) => a.px - b.px);
  const widths = report.viewports.map((v) => v.width).join(" / ");
  const stats = [
    { n: report.components.length, label: t("landing.stat.patterns") },
    { n: report.responsive.changes.length, label: t("landing.stat.responsive") },
    { n: report.accessibility.issues.length, label: t("landing.stat.a11y") },
  ];
  return (
    <div className="crop min-w-0 border border-border-strong bg-surface shadow-[6px_6px_0_0_var(--border)]">
      <div className="flex items-center justify-between gap-3 border-b border-border-strong px-4 py-2.5">
        <span className="label !text-text">{t("landing.specimen")} № 001</span>
        <Badge tone="warn">{t("common.exampleData")}</Badge>
      </div>
      <div className="space-y-5 p-4 sm:p-5">
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <span className="label">{t("landing.palette")}</span>
            <span className="truncate font-mono text-[10.5px] text-faint">
              {t("landing.measured", { widths })}
            </span>
          </div>
          <DnaStrip colors={d.colors} labels className="mt-2 h-16" />
        </div>

        <div className="grid grid-cols-[auto_1fr] items-end gap-x-5 gap-y-2 border-t border-dashed border-border pt-4">
          <span className="label col-span-2">{t("landing.type")}</span>
          <span
            className="text-[64px] leading-[0.85] text-text sm:text-[76px]"
            style={{ fontFamily: headingStack }}
            aria-hidden="true"
          >
            Aa
          </span>
          <div className="min-w-0 space-y-1 pb-1">
            <div className="truncate font-mono text-xs text-text">{headingFamily ?? "—"}</div>
            <div className="flex flex-wrap gap-x-2 font-mono text-[11px] text-muted">
              {sizes.map((s) => (
                <span key={s}>{Math.round(s * 10) / 10}</span>
              ))}
              <span className="text-faint">px</span>
            </div>
          </div>
        </div>

        <div className="border-t border-dashed border-border pt-4">
          <span className="label">{t("landing.spacing")}</span>
          <div className="mt-2 space-y-1">
            {spacing.map((s) => (
              <div key={s.value} className="flex items-center gap-2">
                <span className="w-9 shrink-0 text-right font-mono text-[10.5px] text-muted">
                  {s.px}
                </span>
                <span
                  className="block h-2 bg-accent"
                  style={{ width: `min(${s.px * 1.6}px, 100%)` }}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 border-y border-border-strong">
          {stats.map((s, i) => (
            <div key={s.label} className={i > 0 ? "border-l border-border px-3 py-2" : "py-2 pr-3"}>
              <div className="display text-4xl text-text">{s.n}</div>
              <div className="mt-1 text-[11px] leading-tight text-muted">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="text-sm">
          <span className="label">{t("landing.aiOrigin")}</span>{" "}
          <span className="text-text">
            {t(`conclusion.${report.aiOrigin.conclusion}` as MessageKey)}
          </span>
        </div>
        <Link
          href="/sample"
          className="group inline-flex items-center gap-1 text-sm font-medium text-accent underline decoration-accent/30 underline-offset-4 hover:decoration-accent"
        >
          {t("landing.openSample").replace(/\s*→$/, "")}
          <ArrowUpRight
            size={15}
            className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
          />
        </Link>
      </div>
    </div>
  );
}

export default async function Home() {
  const { t } = await getTranslator();
  return (
    <div className="space-y-24 pb-8">
      <section className="grid gap-12 pt-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:gap-16 lg:pt-10">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="label !text-accent">{t("landing.kicker")}</span>
            <span aria-hidden="true" className="h-px w-8 bg-border-strong" />
            <span className="label">{t("landing.badge")}</span>
          </div>
          <h1 className="display mt-6 text-[2.75rem] text-text sm:text-6xl lg:text-[4.6rem]">
            {t("landing.title")}{" "}
            <em className="text-muted">
              <span className="marked">{t("landing.titleMark").replace(/^—\s*/, "")}</span>
            </em>
          </h1>
          <p className="mt-7 max-w-xl text-[15px] leading-relaxed text-muted">
            {t("landing.intro")}
          </p>
          <div className="mt-9 max-w-2xl">
            <UrlForm autoFocus />
            <p className="mt-3 max-w-xl text-xs leading-relaxed text-faint">
              {t("landing.urlNote")}
            </p>
          </div>
        </div>
        <SpecimenSheet t={t} />
      </section>

      <section>
        <div className="flex items-end justify-between gap-6 border-b border-text pb-3">
          <h2 className="display text-4xl text-text sm:text-5xl">{t("landing.featuresTitle")}</h2>
          <span className="label hidden sm:inline">
            {pad(FEATURES.length)} / {pad(FEATURES.length)}
          </span>
        </div>
        <ol className="grid sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((key, i) => (
            <li
              key={key}
              className="group border-b border-border py-6 sm:px-6 sm:[&:nth-child(2n+1)]:pl-0 lg:border-l lg:[&:nth-child(3n+1)]:border-l-0 lg:[&:nth-child(3n+1)]:pl-0 lg:[&:nth-child(2n+1)]:pl-6"
            >
              <div className="flex items-baseline gap-4">
                <span className="font-mono text-xs text-faint transition-colors group-hover:text-accent">
                  {pad(i + 1)}
                </span>
                <h3 className="text-[17px] font-semibold tracking-tight text-text">
                  {t(`landing.${key}.title` as MessageKey)}
                </h3>
              </div>
              <p className="mt-2 pl-9 text-sm leading-relaxed text-muted">
                {t(`landing.${key}.text` as MessageKey)}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid gap-14 lg:grid-cols-2 lg:gap-16">
        <div className="min-w-0">
          <span className="label">§ {t("landing.method")}</span>
          <h2 className="display mt-3 text-4xl text-text">{t("landing.how.title")}</h2>
          <dl className="mt-8 space-y-6">
            {(["a", "b", "c"] as const).map((k) => {
              const [letter, ...rest] = t(`landing.how.${k}.title` as MessageKey).split(". ");
              return (
                <div key={k} className="grid grid-cols-[3rem_1fr] gap-x-4">
                  <dt className="display row-span-2 text-5xl leading-none text-accent">{letter}</dt>
                  <dd className="text-[15px] font-semibold text-text">
                    {rest.join(". ").replace(/\.$/, "")}
                  </dd>
                  <dd className="mt-1 text-sm leading-relaxed text-muted">
                    {t(`landing.how.${k}.text` as MessageKey)}
                  </dd>
                </div>
              );
            })}
          </dl>
          <p className="mt-8 border-t border-border pt-4 font-mono text-xs text-faint">
            {t("landing.how.versions")}
          </p>
        </div>

        <div className="min-w-0">
          <span className="label">§ {t("landing.limits")}</span>
          <h2 className="display mt-3 text-4xl text-text">{t("landing.limits.title")}</h2>
          <ol className="mt-8 divide-y divide-border border-y border-border">
            {([1, 2, 3, 4, 5] as const).map((n) => (
              <li key={n} className="flex gap-4 py-3 text-sm leading-relaxed text-muted">
                <span className="font-mono text-xs leading-6 text-faint">{pad(n)}</span>
                <span className="min-w-0">{t(`landing.limits.${n}` as MessageKey)}</span>
              </li>
            ))}
          </ol>
          <div className="mt-8">
            <p className="label">{t("landing.scale")}</p>
            <div className="mt-3 grid grid-cols-4 border border-text">
              {SCALE.map((s, i) => (
                <div key={s.c} className={i > 0 ? "border-l border-text" : undefined}>
                  <div className={`h-5 ${s.fill}`} />
                  <div className="border-t border-text px-2 py-2 text-[11px] leading-snug text-text sm:text-xs">
                    {t(`conclusion.${s.c}` as MessageKey)}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-start gap-3 border border-dashed border-border-strong px-2 py-2">
              <div className="checker h-5 w-10 shrink-0 border border-border-strong" />
              <span className="text-[11px] leading-snug text-muted sm:text-xs">
                {t("conclusion.insufficient_evidence")}
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
