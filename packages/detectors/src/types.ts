import type {
  DetectorStatus,
  EvidenceKind,
  EvidenceRef,
  EvidenceStrength,
  FindingCategory,
  SubjectType,
} from "@webdna/shared";
import type { EvidenceBundle } from "./evidence.js";

export interface Provenance {
  /**
   * documented: the vendor/project documents the marker.
   * maintainer-observed: reproduced by a maintainer from a project generated with the tool.
   * public-knowledge: widely known default markup, not yet reproduced from a real project
   *   inside this repository's fixtures. Re-verify before raising a rule's strength.
   * community-reported: reported publicly but not reproduced; such rules ship as experimental.
   */
  type: "documented" | "maintainer-observed" | "public-knowledge" | "community-reported";
  reference?: string;
  lastReviewed: string;
}

/** What a detector returns. The registry adds ids, versions and the experimental cap. */
export interface DetectorResult {
  signatureId?: string;
  signatureVersion?: string;
  category: FindingCategory;
  subject?: string;
  subjectType?: SubjectType;
  finding: string;
  evidenceStrength: EvidenceStrength;
  evidenceKind: EvidenceKind;
  source: string;
  explanation: string;
  evidence: EvidenceRef[];
  alternativeExplanations: string[];
  limitations: string[];
  /** Overrides the detector's own status for this result (signature-level status). */
  experimental?: boolean;
}

export interface Detector {
  id: string;
  name: string;
  version: string;
  category: FindingCategory;
  description: string;
  /** Which bundle fields the detector reads. Shown in the detector catalog. */
  evidenceRequirements: (keyof EvidenceBundle)[];
  /** The strongest evidence this detector can produce. */
  maxStrength: EvidenceStrength;
  limitations: string[];
  falsePositiveConsiderations: string[];
  status: DetectorStatus;
  provenance: Provenance;
  /** Fixture files (relative to repo root) that exercise this detector. */
  fixtures: { positive: string[]; negative: string[] };
  /** Extra selectors / globals the browser must evaluate for this detector. */
  requiredSelectors?: string[];
  requiredGlobals?: string[];
  detect(bundle: EvidenceBundle): DetectorResult[];
}

export const STRENGTH_ORDER: Record<EvidenceStrength, number> = {
  inconclusive: 0,
  weak: 1,
  moderate: 2,
  strong: 3,
};

export function maxStrength(a: EvidenceStrength, b: EvidenceStrength): EvidenceStrength {
  return STRENGTH_ORDER[a] >= STRENGTH_ORDER[b] ? a : b;
}

export function minStrength(a: EvidenceStrength, b: EvidenceStrength): EvidenceStrength {
  return STRENGTH_ORDER[a] <= STRENGTH_ORDER[b] ? a : b;
}
