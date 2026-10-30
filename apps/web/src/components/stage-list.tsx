"use client";

import { Check, Circle, Loader2, MinusCircle, X } from "lucide-react";
import { STAGES, type StageProgress } from "@webdna/shared";
import { useI18n } from "@/i18n/client";
import type { MessageKey } from "@/i18n/messages";
import { cx } from "./ui";

/** Shows the real backend stage states reported by the worker — no simulated progress. */
export function StageList({ stages }: { stages: StageProgress[] }) {
  const { t } = useI18n();
  return (
    <ol className="space-y-1">
      {STAGES.map((def, i) => {
        const s = stages.find((x) => x.id === def.id);
        const state = s?.state ?? "pending";
        const icon = {
          pending: <Circle size={15} className="text-faint" />,
          running: <Loader2 size={15} className="animate-spin text-info" />,
          done: <Check size={15} className="text-accent" />,
          failed: <X size={15} className="text-danger" />,
          skipped: <MinusCircle size={15} className="text-faint" />,
        }[state];
        const ms =
          s?.startedAt && s.finishedAt
            ? Date.parse(s.finishedAt) - Date.parse(s.startedAt)
            : undefined;
        return (
          <li
            key={def.id}
            className={cx(
              "flex items-start gap-3 rounded-md px-3 py-2",
              state === "running" && "bg-info-soft",
            )}
          >
            <span className="mt-0.5">{icon}</span>
            <div className="min-w-0 flex-1">
              <div
                className={cx(
                  "text-sm",
                  state === "pending" || state === "skipped" ? "text-muted" : "text-text",
                )}
              >
                {i + 1}. {t(`stage.${def.id}` as MessageKey)}
              </div>
              {s?.message && (
                <div
                  className={cx(
                    "mt-0.5 text-xs",
                    state === "failed" ? "text-danger" : "text-muted",
                  )}
                >
                  {s.message}
                </div>
              )}
            </div>
            {ms !== undefined && (
              <span className="text-xs tabular-nums text-faint">{(ms / 1000).toFixed(1)}s</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
