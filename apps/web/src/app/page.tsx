import {
  Boxes,
  Code2,
  FileDown,
  Fingerprint,
  LayoutGrid,
  MonitorSmartphone,
  Palette,
  ShieldCheck,
  Type,
} from "lucide-react";
import Link from "next/link";
import type { Report } from "@webdna/shared";
import { AI_CONCLUSION_LABELS, type AiConclusion } from "@webdna/shared";
import { UrlForm } from "@/components/url-form";
import { Badge, Card, Callout } from "@/components/ui";
import type { MessageKey } from "@/i18n/messages";
import { getTranslator } from "@/i18n/server";
import sample from "@/sample/sample-report.json";

const report = sample as unknown as Report;

const FEATURES = [
  { icon: Palette, key: "f1" },
  { icon: Type, key: "f2" },
  { icon: Boxes, key: "f3" },
  { icon: MonitorSmartphone, key: "f4" },
  { icon: Code2, key: "f5" },
  { icon: Fingerprint, key: "f6" },
  { icon: LayoutGrid, key: "f7" },
  { icon: FileDown, key: "f8" },
] as const;

export default async function Home() {
  const { t } = await getTranslator();
  const colors = report.design.colors.slice(0, 8);
  const conclusions = Object.keys(AI_CONCLUSION_LABELS) as AiConclusion[];
  return (
    <div className="space-y-16">
      <section className="grid gap-10 pt-6 lg:grid-cols-[1.2fr_1fr] lg:items-center">
        <div className="min-w-0">
          <Badge tone="outline">{t("landing.badge")}</Badge>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-text sm:text-5xl">
            {t("landing.title")}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted">
            {t("landing.intro")}
          </p>
          <div className="mt-8 max-w-2xl">
            <UrlForm autoFocus />
            <p className="mt-3 text-xs text-faint">{t("landing.urlNote")}</p>
          </div>
        </div>
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="text-sm font-medium text-text">{t("landing.sampleTitle")}</span>
            <Badge tone="warn">{t("common.exampleData")}</Badge>
          </div>
          <div className="space-y-4 p-4">
            <p className="text-xs text-muted">{t("sample.label")}</p>
            <div className="grid grid-cols-8 gap-1.5">
              {colors.map((c) => (
                <div
                  key={c.hex}
                  className="aspect-square rounded border border-border"
                  style={{ background: c.hex }}
                  title={c.hex}
                />
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded border border-border p-2">
                <div className="text-lg font-semibold text-text">{report.components.length}</div>
                <div className="text-muted">{t("landing.stat.patterns")}</div>
              </div>
              <div className="rounded border border-border p-2">
                <div className="text-lg font-semibold text-text">
                  {report.responsive.changes.length}
                </div>
                <div className="text-muted">{t("landing.stat.responsive")}</div>
              </div>
              <div className="rounded border border-border p-2">
                <div className="text-lg font-semibold text-text">
                  {report.accessibility.issues.length}
                </div>
                <div className="text-muted">{t("landing.stat.a11y")}</div>
              </div>
            </div>
            <div className="rounded border border-border px-3 py-2 text-sm">
              <span className="text-muted">{t("landing.aiOrigin")} </span>
              <span className="text-text">
                {t(`conclusion.${report.aiOrigin.conclusion}` as MessageKey)}
              </span>
            </div>
            <Link
              href="/sample"
              className="inline-flex text-sm font-medium text-accent hover:underline"
            >
              {t("landing.openSample")}
            </Link>
          </div>
        </Card>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-text">{t("landing.featuresTitle")}</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <Card key={f.key} className="p-4">
              <f.icon size={18} className="text-accent" />
              <h3 className="mt-3 text-sm font-semibold text-text">
                {t(`landing.${f.key}.title` as MessageKey)}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">
                {t(`landing.${f.key}.text` as MessageKey)}
              </p>
            </Card>
          ))}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-text">
            <ShieldCheck size={18} className="text-accent" /> {t("landing.how.title")}
          </h2>
          <ol className="mt-4 space-y-3 text-sm leading-relaxed text-muted">
            {(["a", "b", "c"] as const).map((k) => (
              <li key={k}>
                <span className="font-medium text-text">
                  {t(`landing.how.${k}.title` as MessageKey)}
                </span>{" "}
                {t(`landing.how.${k}.text` as MessageKey)}
              </li>
            ))}
          </ol>
          <p className="mt-4 text-sm text-muted">{t("landing.how.versions")}</p>
        </Card>
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-text">{t("landing.limits.title")}</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted">
            {([1, 2, 3, 4, 5] as const).map((n) => (
              <li key={n}>{t(`landing.limits.${n}` as MessageKey)}</li>
            ))}
          </ul>
          <div className="mt-4">
            <Callout>
              {t("landing.limits.results")}{" "}
              {conclusions.map((c, i) => (
                <span key={c}>
                  {i > 0 && " · "}
                  <span className="text-text">{t(`conclusion.${c}` as MessageKey)}</span>
                </span>
              ))}
            </Callout>
          </div>
        </Card>
      </section>
    </div>
  );
}
