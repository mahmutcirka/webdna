"use client";

import { ArrowRight, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { ViewportId } from "@webdna/shared";
import { api, ApiError } from "@/lib/api";
import { Button, cx } from "./ui";

const VIEWPORT_OPTIONS: { id: ViewportId; label: string }[] = [
  { id: "desktop", label: "Desktop 1440" },
  { id: "tablet", label: "Tablet 768" },
  { id: "mobile", label: "Mobile 390" },
];

export function UrlForm({
  autoFocus = false,
  compact = false,
}: {
  autoFocus?: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [viewports, setViewports] = useState<ViewportId[]>(["desktop", "tablet", "mobile"]);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(undefined);
    if (viewports.length === 0) return setError("Select at least one viewport.");
    setBusy(true);
    try {
      const { scan } = await api.createScan(url, viewports);
      router.push(`/scans/${scan.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start the scan.");
      setBusy(false);
    }
  };

  const toggle = (id: ViewportId) =>
    setViewports((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));

  return (
    <form onSubmit={submit} className="w-full">
      <div className={cx("flex flex-col gap-2 sm:flex-row", compact ? "" : "sm:items-stretch")}>
        <label className="sr-only" htmlFor="url-input">
          Website URL
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
          className="h-11 min-w-0 flex-1 rounded-md border border-border-strong bg-surface px-3.5 font-mono text-sm text-text placeholder:text-faint focus:border-accent focus:outline-none"
        />
        <Button type="submit" disabled={busy || url.trim().length === 0} className="h-11 px-5">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
          Analyze website
        </Button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
        <span>Viewports:</span>
        {VIEWPORT_OPTIONS.map((v) => (
          <label
            key={v.id}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-border px-2 py-1 hover:border-border-strong"
          >
            <input
              type="checkbox"
              checked={viewports.includes(v.id)}
              onChange={() => toggle(v.id)}
              className="accent-[var(--accent)]"
            />
            {v.label}
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
