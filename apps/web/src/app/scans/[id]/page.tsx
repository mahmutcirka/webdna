"use client";

import { AlertTriangle, Ban, Loader2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Report, ScanRecord } from "@webdna/shared";
import { ReportWorkspace } from "@/components/report/workspace";
import { StageList } from "@/components/stage-list";
import { Button, Card, CardHeader, Callout, StatusBadge } from "@/components/ui";
import { api, ApiError, formatDate, screenshotUrl } from "@/lib/api";

const FAILURE_HELP: Record<string, string> = {
  invalid_url: "Check the URL format. Only http:// and https:// URLs are accepted.",
  blocked_destination:
    "WebDNA only connects to public internet addresses. Private, loopback, link-local and metadata destinations are always blocked, including via redirects.",
  dns_failure: "The domain name could not be resolved.",
  navigation_timeout:
    "The page did not finish loading in time. Slow or very large pages may exceed the limit.",
  navigation_failed:
    "The browser could not load the page (connection error, TLS error, download, or too many redirects).",
  resource_limit: "The page exceeded a safety limit (transfer size, request count or redirects).",
  scan_timeout: "The whole scan exceeded its time limit.",
  interrupted: "The server restarted while the scan was running.",
};

export default function ScanPage() {
  const { id } = useParams<{ id: string }>();
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
        if (alive) setError(e instanceof ApiError ? e.message : "Could not load the scan.");
      }
    };
    void poll();
    return () => {
      alive = false;
      clearTimeout(timer.current);
    };
  }, [id]);

  if (error)
    return (
      <Callout tone="warn" icon={<AlertTriangle size={16} />}>
        {error}
      </Callout>
    );
  if (!scan) return <p className="text-sm text-muted">Loading scan…</p>;
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
      setError(e instanceof ApiError ? e.message : "Cancel failed.");
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="truncate text-xl font-semibold text-text">
            {scan.domain ?? scan.inputUrl}
          </h1>
          <StatusBadge status={scan.status} />
        </div>
        <p className="mt-1 truncate font-mono text-xs text-faint">
          {scan.normalizedUrl ?? scan.inputUrl}
        </p>
        <p className="mt-1 text-xs text-muted">Created {formatDate(scan.createdAt)}</p>
      </div>
      <Card>
        <CardHeader
          title={
            active
              ? "Analysis in progress"
              : scan.status === "cancelled"
                ? "Analysis cancelled"
                : "Analysis failed"
          }
          description={
            active
              ? "These are the worker's actual stages; each updates when the backend finishes it."
              : undefined
          }
          action={
            active ? (
              <Button variant="danger" onClick={() => void cancel()} disabled={cancelling}>
                {cancelling ? <Loader2 size={14} className="animate-spin" /> : <Ban size={14} />}{" "}
                Cancel
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
          {FAILURE_HELP[scan.error.code] && (
            <div className="mt-1 opacity-90">{FAILURE_HELP[scan.error.code]}</div>
          )}
          <div className="mt-2">
            No report was generated, and no partial results are shown as if the scan had succeeded.
          </div>
        </Callout>
      )}
      {!active && (
        <Link href="/dashboard" className="text-sm text-accent hover:underline">
          ← Back to dashboard
        </Link>
      )}
    </div>
  );
}
