"use client";

import { AlertTriangle, RefreshCw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AI_CONCLUSION_LABELS, type ScanRecord } from "@webdna/shared";
import { UrlForm } from "@/components/url-form";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Empty,
  StatusBadge,
  conclusionTone,
} from "@/components/ui";
import { api, ApiError, formatDate } from "@/lib/api";

export default function Dashboard() {
  const [scans, setScans] = useState<ScanRecord[]>();
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    try {
      const { scans } = await api.listScans(100);
      setScans(scans);
      setError(undefined);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load scans.");
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 3000);
    return () => clearInterval(t);
  }, [load]);

  const remove = async (id: string) => {
    if (!confirm("Delete this scan, its report and screenshots? This cannot be undone.")) return;
    try {
      await api.deleteScan(id);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Delete failed.");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text">Dashboard</h1>
        <p className="mt-1 text-sm text-muted">
          Scans stored on this WebDNA instance. Nothing here is shared or aggregated.
        </p>
      </div>
      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold text-text">New analysis</h2>
        <UrlForm />
      </Card>
      <Card>
        <CardHeader
          title="Recent scans"
          description={scans ? `${scans.length} scan(s)` : undefined}
          action={
            <Button variant="ghost" onClick={() => void load()} aria-label="Refresh">
              <RefreshCw size={14} />
            </Button>
          }
        />
        {error && <p className="px-5 py-3 text-sm text-danger">{error}</p>}
        {!scans && !error && <p className="px-5 py-6 text-sm text-muted">Loading…</p>}
        {scans && scans.length === 0 && (
          <div className="p-5">
            <Empty>
              No scans yet. Enter a URL above, or explore the{" "}
              <Link className="text-accent hover:underline" href="/sample">
                sample report
              </Link>
              .
            </Empty>
          </div>
        )}
        {scans && scans.length > 0 && (
          <ul className="divide-y divide-border">
            {scans.map((s) => (
              <li
                key={s.id}
                className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:gap-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/scans/${s.id}`}
                      className="truncate font-medium text-text hover:text-accent"
                    >
                      {s.summary?.title || s.domain || s.inputUrl}
                    </Link>
                    <StatusBadge status={s.status} />
                    {s.summary?.aiConclusion && (
                      <Badge tone={conclusionTone(s.summary.aiConclusion)}>
                        {AI_CONCLUSION_LABELS[s.summary.aiConclusion]}
                      </Badge>
                    )}
                    {s.warnings.length > 0 && (
                      <Badge tone="warn" title={s.warnings.join("\n")}>
                        <AlertTriangle size={11} /> {s.warnings.length}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1 truncate font-mono text-xs text-faint">
                    {s.finalUrl ?? s.normalizedUrl ?? s.inputUrl}
                  </div>
                  {s.error && (
                    <div className="mt-1 text-xs text-danger">
                      {s.error.code}: {s.error.message}
                    </div>
                  )}
                  {s.summary?.platforms && s.summary.platforms.length > 0 && (
                    <div className="mt-1 text-xs text-muted">
                      Platforms: {s.summary.platforms.join(", ")}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-3 text-xs text-muted">
                  <span>{formatDate(s.createdAt)}</span>
                  {s.status !== "queued" && s.status !== "running" && (
                    <Button
                      variant="ghost"
                      className="h-7 px-2"
                      onClick={() => void remove(s.id)}
                      aria-label="Delete scan"
                    >
                      <Trash2 size={14} />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
