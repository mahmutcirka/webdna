"use client";

import { Check, Copy, Download, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PROMPT_STACKS, buildRebuildPrompt, type PromptStack, type Report } from "@webdna/shared";
import { useI18n } from "@/i18n/client";
import { LOCALES, LOCALE_NAMES, type Locale } from "@/i18n/messages";
import { Button, Callout, Card, cx } from "../ui";

function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  render,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  render: (v: T) => string;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-1.5 text-xs font-medium text-muted">{label}</div>
      <div role="group" aria-label={label} className="flex flex-wrap gap-1">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            aria-pressed={o === value}
            onClick={() => onChange(o)}
            className={cx(
              "rounded-md border px-2.5 py-1 text-sm transition",
              o === value
                ? "border-accent bg-accent-soft font-medium text-text"
                : "border-border text-muted hover:text-text",
            )}
          >
            {render(o)}
          </button>
        ))}
      </div>
    </div>
  );
}

export function PromptSection({ report, fileBase }: { report: Report; fileBase: string }) {
  const { t, locale, formatNumber } = useI18n();
  const [stack, setStack] = useState<PromptStack>("react-tailwind");
  const [language, setLanguage] = useState<Locale>(locale);
  const [copy, setCopy] = useState<"idle" | "done" | "failed">("idle");
  useEffect(() => setLanguage(locale), [locale]);

  const prompt = useMemo(
    () => buildRebuildPrompt(report, { stack, language }),
    [report, stack, language],
  );
  const words = useMemo(() => prompt.split(/\s+/).filter(Boolean).length, [prompt]);

  useEffect(() => {
    if (copy === "idle") return;
    const timer = setTimeout(() => setCopy("idle"), 2500);
    return () => clearTimeout(timer);
  }, [copy]);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopy("done");
    } catch {
      setCopy("failed");
    }
  };
  const onDownload = () => {
    const url = URL.createObjectURL(new Blob([prompt], { type: "text/markdown;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileBase}.${stack}.${language}.prompt.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <h2 className="flex items-center gap-2 text-base font-semibold text-text">
          <Sparkles size={16} className="shrink-0 text-accent" /> {t("pr.title")}
        </h2>
        <p className="mt-1 text-sm text-muted">{t("pr.intro")}</p>
        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
          <Segmented
            label={t("pr.stack")}
            options={PROMPT_STACKS}
            value={stack}
            onChange={setStack}
            render={(s) => t(`pr.stack.${s}`)}
          />
          <Segmented
            label={t("pr.language")}
            options={LOCALES}
            value={language}
            onChange={setLanguage}
            render={(l) => LOCALE_NAMES[l]}
          />
          <div className="flex flex-wrap gap-2 sm:ml-auto">
            <Button onClick={onCopy} data-testid="prompt-copy">
              {copy === "done" ? <Check size={14} /> : <Copy size={14} />}
              {copy === "done" ? t("pr.copied") : t("pr.copy")}
            </Button>
            <Button variant="secondary" onClick={onDownload} data-testid="prompt-download">
              <Download size={14} /> {t("pr.download")}
            </Button>
          </div>
        </div>
        <p className="mt-3 text-xs text-faint" aria-live="polite">
          {copy === "failed"
            ? t("pr.copyFailed")
            : t("pr.size", {
                words: formatNumber(words),
                sections: formatNumber(report.outline?.length ?? 0),
              })}
        </p>
      </Card>

      <Callout>{t("pr.originality")}</Callout>
      {!report.outline?.length && <Callout tone="warn">{t("pr.noOutline")}</Callout>}

      <Card className="overflow-hidden">
        <pre
          aria-label={t("pr.preview")}
          tabIndex={0}
          data-testid="prompt-preview"
          lang={language}
          className="max-h-[70vh] overflow-auto whitespace-pre-wrap break-words p-5 font-mono text-[12.5px] leading-relaxed text-text"
        >
          {prompt}
        </pre>
      </Card>
    </div>
  );
}
