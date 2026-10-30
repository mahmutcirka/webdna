"use client";

import { AlertTriangle, Ban, Loader2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Report, ScanRecord } from "@webdna/shared";
import { ReportWorkspace } from "@/components/report/workspace";
import { StageList } from "@/components/stage-list";
import { Button, Card, CardHeader, Callout, StatusBadge } from "@/components/ui";
import { useI18n } from "@/i18n/client";
import type { MessageKey } from "@/i18n/messages";
import { api, ApiError, localizeError, screenshotUrl } from "@/lib/api";

const HELP_CODES = new Set([
  "invalid_url",
  "blocked_destination",
  "dns_failure",
  "navigation_timeout",
  "navigation_failed",
  "resource_limit",
  "scan_timeout",
  "interrupted",
]);

export default function ScanPage() {
  const { id } = useParams<{ id: string }>();
  const i18n = useI18n();
  const { t, tEnum, formatDate } = i18n;
  const [scan, setScan] = useState<ScanRecord>();
  const [report, setReport] = useState<Report>();
  const [error, setError] = useState<string>();
  const [cancelling, setCancelling] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const { scan } = await api.getScan(id);
        if (!alive) return;
        setScan(scan);
        if (scan.status === "completed") {
          const { report } = await api.getReport(id);
          if (alive) setReport(report);
          return;
        }
        if (scan.status === "queued" || scan.status === "running")
          timer.current = setTimeout(poll, 1000);
      } catch (e) {
        if (alive) setError(e instanceof ApiError ? localizeError(e, i18n) : t("scan.loadFailed"));
      }
    };
    void poll();
    return () => {
      alive = false;
      clearTimeout(timer.current);
    };
    // Polling restarts only when the scan changes, not when the language does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (error)
    return (
      <Callout tone="warn" icon={<AlertTriangle size={16} />}>
        {error}
      </Callout>
    );
  if (!scan) return <p className="text-sm text-muted">{t("scan.loading")}</p>;
  if (report)
    return (
      <ReportWorkspace report={report} scanId={id} screenshot={(name) => screenshotUrl(id, name)} />
    );

  const active = scan.status === "queued" || scan.status === "running";
  const cancel = async () => {
    setCancelling(true);
    try {
      await api.cancelScan(id);
    } catch (e) {
      setError(e instanceof ApiError ? localizeError(e, i18n) : t("scan.cancelFailed"));
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="truncate text-xl font-semibold text-text">
            {scan.domain ?? scan.inputUrl}
          </h1>
          <StatusBadge status={scan.status} label={tEnum("status", scan.status)} />
        </div>
        <p className="mt-1 truncate font-mono text-xs text-faint">
          {scan.normalizedUrl ?? scan.inputUrl}
        </p>
        <p className="mt-1 text-xs text-muted">
          {t("scan.created", { date: formatDate(scan.createdAt) })}
        </p>
      </div>
      <Card>
        <CardHeader
          title={
            active
              ? t("scan.inProgress")
              : scan.status === "cancelled"
                ? t("scan.cancelled")
                : t("scan.failed")
          }
          description={active ? t("scan.stagesNote") : undefined}
          action={
            active ? (
              <Button variant="danger" onClick={() => void cancel()} disabled={cancelling}>
                {cancelling ? <Loader2 size={14} className="animate-spin" /> : <Ban size={14} />}{" "}
                {t("scan.cancel")}
              </Button>
            ) : undefined
          }
        />
        <div className="p-3">
          <StageList stages={scan.stages} />
        </div>
      </Card>
      {scan.error && scan.status === "failed" && (
        <Callout tone="warn" icon={<AlertTriangle size={16} />}>
          <div className="font-medium">
            {scan.error.code}: {scan.error.message}
          </div>
          {HELP_CODES.has(scan.error.code) && (
            <div className="mt-1 opacity-90">
              {t(`failureHelp.${scan.error.code}` as MessageKey)}
            </div>
          )}
          <div className="mt-2">{t("scan.noReport")}</div>
        </Callout>
      )}
      {!active && (
        <Link href="/dashboard" className="text-sm text-accent hover:underline">
          {t("scan.back")}
        </Link>
      )}
    </div>
  );
}
