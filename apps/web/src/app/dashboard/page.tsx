"use client";

import { AlertTriangle, RefreshCw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { ScanRecord } from "@webdna/shared";
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
import { useI18n } from "@/i18n/client";
import { api, ApiError, localizeError } from "@/lib/api";

export default function Dashboard() {
  const i18n = useI18n();
  const { t, tEnum, formatDate } = i18n;
  const [scans, setScans] = useState<ScanRecord[]>();
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    try {
      const { scans } = await api.listScans(100);
      setScans(scans);
      setError(undefined);
    } catch (e) {
      setError(e instanceof ApiError ? localizeError(e, i18n) : t("dash.loadFailed"));
    }
  }, [i18n, t]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 3000);
    return () => clearInterval(t);
  }, [load]);

  const remove = async (id: string) => {
    if (!confirm(t("dash.deleteConfirm"))) return;
    try {
      await api.deleteScan(id);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? localizeError(e, i18n) : t("dash.deleteFailed"));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="display text-4xl text-text sm:text-5xl">{t("dash.title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("dash.subtitle")}</p>
      </div>
      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold text-text">{t("dash.new")}</h2>
        <UrlForm />
      </Card>
      <Card>
        <CardHeader
          title={t("dash.recent")}
          description={scans ? t("dash.count", { n: scans.length }) : undefined}
          action={
            <Button variant="ghost" onClick={() => void load()} aria-label={t("dash.refresh")}>
              <RefreshCw size={14} />
            </Button>
          }
        />
        {error && <p className="px-5 py-3 text-sm text-danger">{error}</p>}
        {!scans && !error && <p className="px-5 py-6 text-sm text-muted">{t("common.loading")}</p>}
        {scans && scans.length === 0 && (
          <div className="p-5">
            <Empty>
              {t("dash.empty.before")}{" "}
              <Link className="text-accent hover:underline" href="/sample">
                {t("dash.empty.link")}
              </Link>
              {t("dash.empty.after")}
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
                    <StatusBadge status={s.status} label={tEnum("status", s.status)} />
                    {s.summary?.aiConclusion && (
                      <Badge tone={conclusionTone(s.summary.aiConclusion)}>
                        {tEnum("conclusion", s.summary.aiConclusion)}
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
                      {t("dash.platforms")} {s.summary.platforms.join(", ")}
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
                      aria-label={t("dash.deleteScan")}
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
