"use client";

import { GitCompare } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Report } from "@webdna/shared";
import { exportUrl } from "@/lib/api";
import { Badge, Callout, cx } from "../ui";
import { AiOriginSection } from "./ai-origin";
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
  ["overview", "Overview"],
  ["design", "Design system"],
  ["typography", "Typography"],
  ["components", "Components"],
  ["layout", "Layout"],
  ["responsive", "Responsive"],
  ["source", "Source analysis"],
  ["ai", "AI-origin"],
  ["a11y", "Accessibility"],
  ["assets", "Assets"],
  ["export", "Export"],
] as const;
type TabId = (typeof TABS)[number][0];

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
  const [tab, setTab] = useState<TabId>("overview");
  const [inspect, setInspect] = useState<InspectTarget>();
  const shots: ScreenshotSource = { url: screenshot, fullPage };

  useEffect(() => {
    const sync = () => {
      const fromHash = window.location.hash.slice(1) as TabId;
      if (TABS.some(([id]) => id === fromHash)) setTab(fromHash);
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
        {report.sample && <Callout tone="warn">{report.sample.label}</Callout>}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-semibold text-text">
                {report.metadata.title || report.target.domain}
              </h1>
              {report.sample && <Badge tone="warn">Example data</Badge>}
            </div>
            <a
              href={report.target.finalUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-1 block truncate font-mono text-xs text-faint hover:text-muted"
            >
              {report.target.finalUrl}
            </a>
          </div>
          {scanId && (
            <Link
              href={`/compare?a=${scanId}`}
              className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
            >
              <GitCompare size={14} /> Compare with another scan
            </Link>
          )}
        </div>

        <nav
          className="-mx-4 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0"
          aria-label="Report sections"
        >
          <div className="flex min-w-max gap-1">
            {TABS.map(([id, label]) => (
              <button
                key={id}
                onClick={() => select(id)}
                className={cx(
                  "border-b-2 px-3 py-2 text-sm transition",
                  tab === id
                    ? "border-accent font-medium text-text"
                    : "border-transparent text-muted hover:text-text",
                )}
                aria-current={tab === id ? "page" : undefined}
              >
                {label}
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
