import type { DetectorRun, Finding } from "@webdna/shared";
import type { EvidenceBundle } from "./evidence.js";
import { minStrength, type Detector } from "./types.js";

export interface RunOptions {
  /** Detector ids to skip for this run (e.g. from WEBDNA_DISABLED_DETECTORS). */
  disabled?: string[];
}

export interface RunResult {
  findings: Finding[];
  runs: DetectorRun[];
}

export class DetectorRegistry {
  private readonly detectors = new Map<string, Detector>();

  constructor(
    /** Version of the rule set as a whole; recorded in every report. */
    readonly ruleSetVersion: string,
  ) {}

  register(detector: Detector): this {
    if (this.detectors.has(detector.id)) {
      throw new Error(`Duplicate detector id: ${detector.id}`);
    }
    this.detectors.set(detector.id, detector);
    return this;
  }

  list(): Detector[] {
    return [...this.detectors.values()];
  }

  get(id: string): Detector | undefined {
    return this.detectors.get(id);
  }

  requiredSelectors(): string[] {
    return unique(this.list().flatMap((d) => d.requiredSelectors ?? []));
  }

  requiredGlobals(): string[] {
    return unique(this.list().flatMap((d) => d.requiredGlobals ?? []));
  }

  run(bundle: EvidenceBundle, options: RunOptions = {}): RunResult {
    const disabled = new Set(options.disabled ?? []);
    const findings: Finding[] = [];
    const runs: DetectorRun[] = [];

    for (const detector of this.detectors.values()) {
      const base = {
        id: detector.id,
        version: detector.version,
        name: detector.name,
        category: detector.category,
        status: detector.status,
      };
      if (detector.status === "disabled" || disabled.has(detector.id)) {
        runs.push({ ...base, status: "disabled", ran: false, findingCount: 0 });
        continue;
      }
      try {
        const results = detector.detect(bundle);
        results.forEach((result, index) => {
          const experimental = result.experimental ?? detector.status === "experimental";
          // Experimental rules can never contribute more than weak evidence.
          const strength = experimental
            ? minStrength(result.evidenceStrength, "weak")
            : minStrength(result.evidenceStrength, detector.maxStrength);
          const { experimental: _ignored, ...rest } = result;
          findings.push({
            ...rest,
            id: `${detector.id}#${index}`,
            detectorId: detector.id,
            detectorVersion: detector.version,
            evidenceStrength: strength,
            experimental,
            limitations: experimental
              ? [
                  ...rest.limitations,
                  "This rule is experimental: its signature has not been reproduced by a maintainer, so its strength is capped at weak.",
                ]
              : rest.limitations,
          });
        });
        runs.push({ ...base, ran: true, findingCount: results.length });
      } catch (error) {
        // A broken rule must never break the scan; record it instead.
        runs.push({
          ...base,
          ran: false,
          findingCount: 0,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return { findings, runs };
  }
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
