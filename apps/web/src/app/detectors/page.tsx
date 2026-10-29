"use client";

import { useEffect, useState } from "react";
import { Badge, Callout, Card, Mono } from "@/components/ui";
import { api, ApiError, type DetectorInfo } from "@/lib/api";

const CATEGORY_LABEL: Record<string, string> = {
  platform: "Platform identification",
  ai_origin_signal: "AI-related signals",
  template_signal: "Template & boilerplate",
};

export default function DetectorsPage() {
  const [data, setData] = useState<{ ruleSetVersion: string; detectors: DetectorInfo[] }>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    api
      .detectors()
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load detectors."));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text">Detector catalog</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Every rule is versioned and documents what it reads, its strongest possible evidence, its
          limitations and its provenance. Experimental rules (community-reported, not reproduced)
          are capped at weak evidence.
        </p>
        {data && (
          <p className="mt-2 text-xs text-faint">
            Rule set <Mono>{data.ruleSetVersion}</Mono>
          </p>
        )}
      </div>
      {error && <Callout tone="warn">{error}</Callout>}
      {data &&
        Object.entries(CATEGORY_LABEL).map(([cat, label]) => {
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
                      <Badge tone={d.status === "active" ? "neutral" : "warn"}>{d.status}</Badge>
                      <Badge tone="outline">max {d.maxStrength}</Badge>
                    </div>
                    <div className="mt-1">
                      <Mono>
                        {d.id}@{d.version}
                      </Mono>
                    </div>
                    <p className="mt-2 text-muted">{d.description}</p>
                    <div className="mt-2 text-xs text-faint">
                      Reads: {d.evidenceRequirements.join(", ")} · Provenance: {d.provenance.type}{" "}
                      (reviewed {d.provenance.lastReviewed})
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
