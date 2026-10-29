import type { Finding, Report, ReportComparison, ValueDiff } from "@webdna/shared";

function diff(a: string[], b: string[]): ValueDiff {
  const sa = new Set(a),
    sb = new Set(b);
  return {
    added: [...sb].filter((v) => !sa.has(v)),
    removed: [...sa].filter((v) => !sb.has(v)),
    unchanged: [...sa].filter((v) => sb.has(v)).length,
  };
}

function findingKey(f: Finding): string {
  return `${f.detectorId}|${f.category}|${f.subject ?? f.finding}`;
}

/**
 * Compare two reports. Detector-version differences are reported explicitly so a
 * changed finding can be attributed to a rule change rather than a site change.
 */
export function compareReports(a: Report, b: Report): ReportComparison {
  const notes: string[] = [];
  const sameTarget = a.target.domain === b.target.domain;
  if (!sameTarget)
    notes.push("The reports are for different domains; differences describe two different sites.");
  const ruleSetChanged = a.aiOrigin.ruleSetVersion !== b.aiOrigin.ruleSetVersion;
  if (ruleSetChanged)
    notes.push(
      "The detector rule set differs between the scans; some AI-origin differences may come from rule changes.",
    );
  if (a.schemaVersion !== b.schemaVersion)
    notes.push(`Report schema versions differ (${a.schemaVersion} vs ${b.schemaVersion}).`);

  const versionsA = new Map(a.aiOrigin.detectors.map((d) => [d.id, d.version]));
  const versionsB = new Map(b.aiOrigin.detectors.map((d) => [d.id, d.version]));
  const detectorVersionChanges = [...new Set([...versionsA.keys(), ...versionsB.keys()])]
    .filter((id) => versionsA.get(id) !== versionsB.get(id))
    .map((id) => ({ id, a: versionsA.get(id), b: versionsB.get(id) }));
  const changedDetectors = new Set(detectorVersionChanges.map((d) => d.id));

  const allFindings = (r: Report) => [
    ...r.aiOrigin.platformFindings,
    ...r.aiOrigin.aiFindings,
    ...r.aiOrigin.templateFindings,
  ];
  const fa = new Map(allFindings(a).map((f) => [findingKey(f), f]));
  const fb = new Map(allFindings(b).map((f) => [findingKey(f), f]));
  const cause = (f: Finding) =>
    changedDetectors.has(f.detectorId)
      ? "detector version changed — may reflect a rule change"
      : "same detector version — likely a change in the site";

  const kinds = new Set([...a.components.map((c) => c.kind), ...b.components.map((c) => c.kind)]);
  const countKind = (r: Report, k: string) =>
    r.components.filter((c) => c.kind === k).reduce((n, c) => n + c.count, 0);

  const overflow = (r: Report) =>
    r.responsive.changes
      .filter((c) => c.kind === "overflow")
      .map((c) => `${c.to}: ${c.description}`);

  return {
    a: {
      scanId: a.scanId,
      createdAt: a.createdAt,
      url: a.target.finalUrl,
      ruleSetVersion: a.aiOrigin.ruleSetVersion,
    },
    b: {
      scanId: b.scanId,
      createdAt: b.createdAt,
      url: b.target.finalUrl,
      ruleSetVersion: b.aiOrigin.ruleSetVersion,
    },
    sameTarget,
    ruleSetChanged,
    detectorVersionChanges,
    colors: diff(
      a.design.colors.map((c) => c.hex),
      b.design.colors.map((c) => c.hex),
    ),
    fontFamilies: diff(
      a.design.typography.families.map((f) => f.family),
      b.design.typography.families.map((f) => f.family),
    ),
    fontSizes: diff(
      a.design.typography.sizeScalePx.map(String),
      b.design.typography.sizeScalePx.map(String),
    ),
    spacing: diff(
      a.design.spacing.map((s) => s.value),
      b.design.spacing.map((s) => s.value),
    ),
    radii: diff(
      a.design.radii.map((s) => s.value),
      b.design.radii.map((s) => s.value),
    ),
    shadows: diff(
      a.design.shadows.map((s) => s.value),
      b.design.shadows.map((s) => s.value),
    ),
    components: [...kinds].map((kind) => ({ kind, a: countKind(a, kind), b: countKind(b, kind) })),
    responsive: {
      a: a.responsive.changes.length,
      b: b.responsive.changes.length,
      overflowA: overflow(a),
      overflowB: overflow(b),
    },
    aiOrigin: {
      conclusionA: a.aiOrigin.conclusionLabel,
      conclusionB: b.aiOrigin.conclusionLabel,
      findingsAdded: [...fb.entries()]
        .filter(([k]) => !fa.has(k))
        .map(([key, f]) => ({ key, finding: f.finding, cause: cause(f) })),
      findingsRemoved: [...fa.entries()]
        .filter(([k]) => !fb.has(k))
        .map(([key, f]) => ({ key, finding: f.finding, cause: cause(f) })),
    },
    notes,
  };
}
