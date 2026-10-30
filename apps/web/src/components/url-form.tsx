"use client";

import { ArrowRight, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { ViewportId } from "@webdna/shared";
import { useI18n } from "@/i18n/client";
import { api, ApiError, localizeError } from "@/lib/api";
import { Button, cx } from "./ui";

const VIEWPORT_OPTIONS: ViewportId[] = ["desktop", "tablet", "mobile"];

export function UrlForm({
  autoFocus = false,
  compact = false,
}: {
  autoFocus?: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const i18n = useI18n();
  const { t } = i18n;
  const [url, setUrl] = useState("");
  const [viewports, setViewports] = useState<ViewportId[]>(["desktop", "tablet", "mobile"]);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(undefined);
    if (viewports.length === 0) return setError(t("form.selectViewport"));
    setBusy(true);
    try {
      const { scan } = await api.createScan(url, viewports);
      router.push(`/scans/${scan.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? localizeError(err, i18n) : t("form.startFailed"));
      setBusy(false);
    }
  };

  const toggle = (id: ViewportId) =>
    setViewports((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));

  return (
    <form onSubmit={submit} className="w-full">
      <div
        className={cx(
          "flex flex-col gap-2 sm:flex-row sm:gap-0",
          compact
            ? ""
            : "border-text sm:items-stretch sm:border sm:bg-surface sm:p-1 sm:shadow-[4px_4px_0_0_var(--border)] sm:has-[input:focus-visible]:outline-2 sm:has-[input:focus-visible]:outline-offset-2 sm:has-[input:focus-visible]:outline-accent",
        )}
      >
        <label className="sr-only" htmlFor="url-input">
          {t("form.urlLabel")}
        </label>
        <input
          id="url-input"
          type="text"
          inputMode="url"
          autoComplete="url"
          spellCheck={false}
          autoFocus={autoFocus}
          required
          placeholder="https://example.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className={cx(
            "h-12 min-w-0 flex-1 border border-text bg-surface px-4 font-mono text-[15px] text-text placeholder:text-faint",
            !compact && "sm:border-0 sm:bg-transparent sm:focus-visible:outline-none",
          )}
        />
        <Button
          type="submit"
          disabled={busy || url.trim().length === 0}
          className="h-12 rounded-none px-6"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
          {t("form.analyze")}
        </Button>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted">
        <span className="label mr-1">{t("form.viewports")}</span>
        {VIEWPORT_OPTIONS.map((v) => (
          <label
            key={v}
            className="inline-flex cursor-pointer items-center gap-2 rounded-[2px] border border-border bg-surface px-2 py-1 transition-colors hover:border-border-strong has-[:checked]:border-text has-[:checked]:text-text"
          >
            <input
              type="checkbox"
              checked={viewports.includes(v)}
              onChange={() => toggle(v)}
              className="accent-[var(--accent)]"
            />
            {t(`form.vp.${v}`)}
          </label>
        ))}
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
