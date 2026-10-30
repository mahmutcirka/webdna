"use client";

import { Check, Loader2, Minus, X } from "lucide-react";
import { STAGES, type StageProgress } from "@webdna/shared";
import { useI18n } from "@/i18n/client";
import type { MessageKey } from "@/i18n/messages";
import { cx } from "./ui";

/** Shows the real backend stage states reported by the worker — no simulated progress. */
export function StageList({ stages }: { stages: StageProgress[] }) {
  const { t } = useI18n();
  const stateOf = (id: string) => stages.find((x) => x.id === id)?.state ?? "pending";
  return (
    <div>
      <div aria-hidden="true" className="flex h-3 gap-[3px] px-3 pt-1">
        {STAGES.map((def) => {
          const state = stateOf(def.id);
          return (
            <div
              key={def.id}
              className={cx(
                "relative flex-1 overflow-hidden border border-text/70",
                state === "done" && "bg-text",
                state === "failed" && "border-danger bg-danger",
                state === "skipped" && "checker",
                state === "running" && "bg-mark",
              )}
            >
              {state === "running" && (
                <div className="scan-line absolute inset-x-0 h-full bg-gradient-to-b from-transparent via-text/40 to-transparent" />
              )}
            </div>
          );
        })}
      </div>
      <ol className="mt-3 divide-y divide-border border-t border-border">
        {STAGES.map((def, i) => {
          const s = stages.find((x) => x.id === def.id);
          const state = s?.state ?? "pending";
          const icon = {
            pending: <span className="block size-2 border border-faint" />,
            running: <Loader2 size={14} className="animate-spin text-text" />,
            done: <Check size={14} className="text-text" />,
            failed: <X size={14} className="text-danger" />,
            skipped: <Minus size={14} className="text-faint" />,
          }[state];
          const ms =
            s?.startedAt && s.finishedAt
              ? Date.parse(s.finishedAt) - Date.parse(s.startedAt)
              : undefined;
          return (
            <li
              key={def.id}
              className={cx(
                "grid grid-cols-[1.75rem_1rem_1fr_auto] items-start gap-3 px-3 py-2.5",
                state === "running" && "bg-mark/25",
              )}
            >
              <span className="pt-px font-mono text-[11px] text-faint">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="flex h-5 items-center justify-center">{icon}</span>
              <div className="min-w-0">
                <div
                  className={cx(
                    "text-sm",
                    state === "pending" || state === "skipped" ? "text-muted" : "text-text",
                    state === "running" && "font-medium",
                  )}
                >
                  {t(`stage.${def.id}` as MessageKey)}
                </div>
                {s?.message && (
                  <div
                    className={cx(
                      "mt-0.5 font-mono text-[11px]",
                      state === "failed" ? "text-danger" : "text-muted",
                    )}
                  >
                    {s.message}
                  </div>
                )}
              </div>
              <span className="pt-px font-mono text-[11px] tabular-nums text-faint">
                {ms !== undefined ? `${(ms / 1000).toFixed(1)}s` : ""}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
