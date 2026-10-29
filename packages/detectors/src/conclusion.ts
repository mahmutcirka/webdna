import {
  AI_CONCLUSION_LABELS,
  AI_ORIGIN_DISCLAIMER,
  type AiConclusion,
  type AiOriginReport,
  type DetectorRun,
  type EvidenceCoverage,
  type Finding,
  type PlatformSummary,
} from "@webdna/shared";
import { STRENGTH_ORDER } from "./types.js";

/** Whether enough evidence was available to say anything about origin at all. */
export function coverageIsInsufficient(coverage: EvidenceCoverage): string | undefined {
  if (coverage.blockingPageSuspected) {
    return "The page appears to be a bot-challenge, error or access-denied page rather than the site itself.";
  }
  if (!coverage.htmlInspected && !coverage.renderedDomInspected) {
    return "Neither the HTML response nor the rendered DOM could be inspected.";
  }
  if (
    coverage.visibleTextChars < 40 &&
    coverage.scriptsInspected === 0 &&
    coverage.stylesheetsInspected === 0
  ) {
    return "The page exposed almost no text, scripts or stylesheets to inspect.";
  }
  return undefined;
}

/**
 * Derive the evidence category. Deliberately simple and monotone:
 * the strongest single AI-related finding decides; counts of weaker findings never escalate.
 */
export function concludeAiOrigin(
  findings: Finding[],
  coverage: EvidenceCoverage,
  detectors: DetectorRun[],
  ruleSetVersion: string,
): AiOriginReport {
  const byStrength = (a: Finding, b: Finding) =>
    STRENGTH_ORDER[b.evidenceStrength] - STRENGTH_ORDER[a.evidenceStrength];
  const platformFindings = findings.filter((f) => f.category === "platform").sort(byStrength);
  const aiFindings = findings.filter((f) => f.category === "ai_origin_signal").sort(byStrength);
  const templateFindings = findings
    .filter((f) => f.category === "template_signal")
    .sort(byStrength);

  const rationale: string[] = [];
  const top = aiFindings[0];
  let conclusion: AiConclusion;
  if (top && top.evidenceStrength === "strong") {
    conclusion = "strong_ai_evidence";
    rationale.push(
      `Strongest AI-related finding: "${top.finding}" (${top.evidenceKind} evidence, strong).`,
    );
  } else if (top && top.evidenceStrength === "moderate") {
    conclusion = "some_ai_indicators";
    rationale.push(`Strongest AI-related finding is moderate: "${top.finding}".`);
  } else if (top) {
    conclusion = "weak_or_ambiguous";
    rationale.push(
      `${aiFindings.length} AI-related indicator(s) found, none stronger than weak. Weak indicators are not combined into a stronger conclusion.`,
    );
  } else {
    const insufficient = coverageIsInsufficient(coverage);
    if (insufficient) {
      conclusion = "insufficient_evidence";
      rationale.push(insufficient);
    } else {
      conclusion = "no_meaningful_evidence";
      rationale.push(
        "No detector produced an AI-related finding from the evidence that was available.",
      );
      rationale.push(
        "Absence of markers does not show that no AI tools were used; markers are easy to remove.",
      );
    }
  }

  if (templateFindings.length > 0) {
    rationale.push(
      `${templateFindings.length} template/boilerplate signal(s) were found. They are reported separately and do not affect the AI-origin category.`,
    );
  }
  const frameworkOnly = platformFindings.filter((f) => f.subjectType !== "ai_builder");
  if (frameworkOnly.length > 0 && aiFindings.length === 0) {
    rationale.push(
      "Framework, CMS or hosting identification was possible; this is platform information, not evidence of AI generation.",
    );
  }
  const unrun = detectors.filter((d) => d.error);
  if (unrun.length > 0) rationale.push(`${unrun.length} detector(s) failed and were skipped.`);

  return {
    conclusion,
    conclusionLabel: AI_CONCLUSION_LABELS[conclusion],
    rationale,
    platformIdentification: summarisePlatforms(platformFindings),
    platformFindings,
    aiFindings,
    templateFindings,
    conflicts: findConflicts(platformFindings, aiFindings),
    coverage,
    ruleSetVersion,
    detectors,
    disclaimer: AI_ORIGIN_DISCLAIMER,
  };
}

function summarisePlatforms(findings: Finding[]): AiOriginReport["platformIdentification"] {
  const map = new Map<string, PlatformSummary>();
  for (const f of findings) {
    if (!f.subject || !f.subjectType) continue;
    const existing = map.get(f.subject);
    if (!existing) {
      map.set(f.subject, {
        name: f.subject,
        type: f.subjectType,
        strength: f.evidenceStrength,
        findingIds: [f.id],
      });
    } else {
      existing.findingIds.push(f.id);
      if (STRENGTH_ORDER[f.evidenceStrength] > STRENGTH_ORDER[existing.strength])
        existing.strength = f.evidenceStrength;
    }
  }
  const platforms = [...map.values()];
  return {
    identified: platforms.some((p) => STRENGTH_ORDER[p.strength] >= STRENGTH_ORDER.moderate),
    platforms,
  };
}

function findConflicts(platformFindings: Finding[], aiFindings: Finding[]): string[] {
  const conflicts: string[] = [];
  const solid = (f: Finding) => STRENGTH_ORDER[f.evidenceStrength] >= STRENGTH_ORDER.moderate;
  const aiBuilders = new Set(
    [...platformFindings, ...aiFindings]
      .filter((f) => solid(f) && f.subjectType === "ai_builder")
      .map((f) => f.subject),
  );
  if (aiBuilders.size > 1) {
    conflicts.push(
      `Markers from more than one AI builder were found (${[...aiBuilders].join(", ")}). The site may have moved between tools, or one marker was copied.`,
    );
  }
  const builders = platformFindings
    .filter((f) => solid(f) && (f.subjectType === "cms" || f.subjectType === "website_builder"))
    .map((f) => f.subject);
  if (builders.length > 1) {
    conflicts.push(
      `Several CMS/website-builder fingerprints were found (${builders.join(", ")}); some may be embedded or leftover.`,
    );
  }
  if (aiBuilders.size > 0 && builders.length > 0) {
    conflicts.push(
      `Both an AI builder (${[...aiBuilders].join(", ")}) and a conventional CMS/builder (${builders.join(", ")}) were identified.`,
    );
  }
  return conflicts;
}
