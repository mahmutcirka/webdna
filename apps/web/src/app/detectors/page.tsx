"use client";

import { useEffect, useState } from "react";
import { Badge, Callout, Card, Mono } from "@/components/ui";
import { useI18n } from "@/i18n/client";
import { api, ApiError, localizeError, type DetectorInfo } from "@/lib/api";

const CATEGORIES = ["platform", "ai_origin_signal", "template_signal"] as const;

export default function DetectorsPage() {
  const i18n = useI18n();
  const { t, tEnum } = i18n;
  const [data, setData] = useState<{ ruleSetVersion: string; detectors: DetectorInfo[] }>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    api
      .detectors()
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? localizeError(e, i18n) : t("det.loadFailed")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="display text-4xl text-text sm:text-5xl">{t("det.title")}</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">{t("det.subtitle")}</p>
        {data && (
          <p className="mt-2 text-xs text-faint">
            {t("common.ruleSet")} <Mono>{data.ruleSetVersion}</Mono>
          </p>
        )}
      </div>
      {error && <Callout tone="warn">{error}</Callout>}
      {data &&
        CATEGORIES.map((cat) => {
          const label = t(`det.cat.${cat}`);
          const list = data.detectors.filter((d) => d.category === cat);
          return (
            <section key={cat}>
              <h2 className="mb-3 text-sm font-semibold text-text">
                {label} <span className="font-normal text-muted">({list.length})</span>
              </h2>
              <div className="grid gap-3 md:grid-cols-2">
                {list.map((d) => (
                  <Card key={d.id} className="p-4 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-text">{d.name}</span>
                      <Badge tone={d.status === "active" ? "neutral" : "warn"}>
                        {tEnum("detStatus", d.status)}
                      </Badge>
                      <Badge tone="outline">
                        {t("det.max", { s: tEnum("strength", d.maxStrength) })}
                      </Badge>
                    </div>
                    <div className="mt-1">
                      <Mono>
                        {d.id}@{d.version}
                      </Mono>
                    </div>
                    <p className="mt-2 text-muted">{d.description}</p>
                    <div className="mt-2 text-xs text-faint">
                      {t("det.reads", {
                        r: d.evidenceRequirements.join(", "),
                        p: d.provenance.type,
                        d: d.provenance.lastReviewed,
                      })}
                    </div>
                    {d.provenance.reference && (
                      <div className="mt-1 break-words text-xs text-faint">
                        {d.provenance.reference}
                      </div>
                    )}
                    {d.limitations.length > 0 && (
                      <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-muted">
                        {d.limitations.map((l) => (
                          <li key={l}>{l}</li>
                        ))}
                      </ul>
                    )}
                  </Card>
                ))}
              </div>
            </section>
          );
        })}
    </div>
  );
}
