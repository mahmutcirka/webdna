"use client";

import { GitCompare } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Report } from "@webdna/shared";
import { useI18n } from "@/i18n/client";
import { exportUrl } from "@/lib/api";
import { DnaStrip } from "../dna-strip";
import { Badge, Callout, cx } from "../ui";
import { AiOriginSection } from "./ai-origin";
import { PromptSection } from "./prompt";
import {
  InspectContext,
  InspectorDrawer,
  type InspectTarget,
  type ScreenshotSource,
} from "./inspector";
import {
  AccessibilitySection,
  AssetsSection,
  ComponentsSection,
  DesignSection,
  ExportSection,
  LayoutSection,
  OverviewSection,
  ResponsiveSection,
  SourceSection,
  TypographySection,
} from "./sections";

const TABS = [
  "overview",
  "design",
  "typography",
  "components",
  "layout",
  "responsive",
  "source",
  "ai",
  "a11y",
  "assets",
  "prompt",
  "export",
] as const;
type TabId = (typeof TABS)[number];

export function ReportWorkspace({
  report,
  scanId,
  screenshot,
  fullPage = true,
}: {
  report: Report;
  scanId?: string;
  screenshot: (name: string) => string;
  fullPage?: boolean;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<TabId>("overview");
  const [inspect, setInspect] = useState<InspectTarget>();
  const shots: ScreenshotSource = { url: screenshot, fullPage };

  useEffect(() => {
    const sync = () => {
      const fromHash = window.location.hash.slice(1) as TabId;
      if (TABS.some((id) => id === fromHash)) setTab(fromHash);
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  const select = (id: TabId) => {
    setTab(id);
    history.replaceState(null, "", `#${id}`);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setInspect(undefined);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <InspectContext.Provider value={setInspect}>
      <div className="space-y-6">
        {report.sample && <Callout tone="warn">{t("sample.label")}</Callout>}
        {t("common.engineEnglish") && <Callout>{t("common.engineEnglish")}</Callout>}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="label !text-accent">{t("ws.caseFile")}</span>
              <span aria-hidden="true" className="h-px w-8 bg-border-strong" />
              <span className="label">
                {report.scanId.slice(0, 8)} · {report.target.domain}
              </span>
              {report.sample && <Badge tone="warn">{t("common.exampleData")}</Badge>}
            </div>
            <h1 className="display mt-3 text-4xl text-text sm:text-5xl">
              {report.metadata.title || report.target.domain}
            </h1>
            <a
              href={report.target.finalUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-2 block truncate font-mono text-xs text-faint underline-offset-4 hover:text-muted hover:underline"
            >
              {report.target.finalUrl}
            </a>
          </div>
          {scanId && (
            <Link
              href={`/compare?a=${scanId}`}
              className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
            >
              <GitCompare size={14} /> {t("ws.compare")}
            </Link>
          )}
        </div>
        {report.design.colors.length > 0 && (
          <DnaStrip colors={report.design.colors} max={32} labels className="h-10" />
        )}

        <nav
          className="sticky top-[66px] z-20 -mx-4 overflow-x-auto border-y border-text bg-bg/95 px-4 backdrop-blur-sm sm:mx-0 sm:px-0"
          aria-label={t("ws.sections")}
        >
          <div className="flex min-w-max">
            {TABS.map((id, i) => (
              <button
                key={id}
                onClick={() => select(id)}
                className={cx(
                  "group flex items-baseline gap-1.5 border-r border-border px-3 py-2.5 text-sm transition-colors last:border-r-0",
                  tab === id ? "bg-text text-bg" : "text-muted hover:bg-surface-2 hover:text-text",
                )}
                aria-current={tab === id ? "page" : undefined}
              >
                <span
                  aria-hidden="true"
                  className={cx(
                    "font-mono text-[10px]",
                    tab === id ? "text-bg/60" : "text-faint group-hover:text-accent",
                  )}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                {t(`tab.${id}`)}
              </button>
            ))}
          </div>
        </nav>

        {tab === "overview" && <OverviewSection report={report} shots={shots} />}
        {tab === "design" && <DesignSection report={report} />}
        {tab === "typography" && <TypographySection report={report} />}
        {tab === "components" && <ComponentsSection report={report} />}
        {tab === "layout" && <LayoutSection report={report} />}
        {tab === "responsive" && <ResponsiveSection report={report} shots={shots} />}
        {tab === "source" && <SourceSection report={report} />}
        {tab === "ai" && <AiOriginSection report={report} />}
        {tab === "a11y" && <AccessibilitySection report={report} />}
        {tab === "assets" && <AssetsSection report={report} />}
        {tab === "prompt" && (
          <PromptSection
            report={report}
            fileBase={`webdna-${report.target.domain.replace(/[^a-z0-9.-]/gi, "_")}${scanId ? `-${scanId.slice(0, 8)}` : ""}`}
          />
        )}
        {tab === "export" && (
          <ExportSection
            scanId={scanId}
            exportHref={scanId ? (f) => exportUrl(scanId, f) : undefined}
          />
        )}
      </div>
      <InspectorDrawer
        target={inspect}
        report={report}
        shots={shots}
        onClose={() => setInspect(undefined)}
      />
    </InspectContext.Provider>
  );
}
