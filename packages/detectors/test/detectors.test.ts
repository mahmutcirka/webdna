import { describe, expect, it } from "vitest";
import type { Finding } from "@webdna/shared";
import {
  DetectorRegistry,
  SIGNATURE_SETS,
  bundleFromHtml,
  concludeAiOrigin,
  emptyCoverage,
  type Detector,
} from "../src/index.js";
import { analyze, analyzeFixture, fixtureBundle, registry } from "./helpers.js";

const names = (fs: Finding[]) => fs.map((f) => f.subject);

describe("registry and signatures", () => {
  it("loads every signature set and registers unique detector ids", () => {
    expect(SIGNATURE_SETS.length).toBeGreaterThanOrEqual(2);
    const ids = registry.list().map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("documents limitations, provenance and version for every detector", () => {
    for (const d of registry.list()) {
      expect(d.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(d.description.length).toBeGreaterThan(10);
      expect(Array.isArray(d.limitations)).toBe(true);
      expect(d.provenance.lastReviewed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("ships community-reported signatures only as experimental", () => {
    for (const set of SIGNATURE_SETS) {
      for (const s of set.signatures) {
        if (s.provenance.type === "community-reported") expect(s.status).toBe("experimental");
      }
    }
  });

  it("records a failing detector without breaking the run", () => {
    const broken: Detector = {
      ...registry.list()[0]!,
      id: "test.broken",
      detect: () => {
        throw new Error("boom");
      },
    };
    const r = new DetectorRegistry("test").register(broken);
    const result = r.run(fixtureBundle("basic-landing"));
    expect(result.findings).toEqual([]);
    expect(result.runs[0]).toMatchObject({ id: "test.broken", ran: false, error: "boom" });
  });

  it("skips disabled detectors and records that they did not run", () => {
    const report = analyze(fixtureBundle("generator-marker"), ["sig.ai-builders.lovable"]);
    expect(report.detectors.find((d) => d.id === "sig.ai-builders.lovable")).toMatchObject({
      ran: false,
      status: "disabled",
    });
    expect(names(report.platformFindings)).not.toContain("Lovable (formerly GPT Engineer)");
  });
});

describe("explicit AI-builder evidence (positive fixtures)", () => {
  it("reports strong AI-related evidence for the Lovable editor script", () => {
    const r = analyzeFixture("generator-marker");
    expect(r.conclusion).toBe("strong_ai_evidence");
    const platform = r.platformFindings.find((f) => f.signatureId === "lovable")!;
    expect(platform.subjectType).toBe("ai_builder");
    expect(
      platform.evidence.some((e) => e.type === "script_url" && e.value?.includes("gptengineer.js")),
    ).toBe(true);
    const ai = r.aiFindings.find((f) => f.signatureId === "lovable")!;
    // The AI link is inferred from the platform: indirect, never "direct".
    expect(ai.evidenceKind).toBe("indirect");
    expect(ai.alternativeExplanations.length).toBeGreaterThan(0);
    expect(ai.limitations).toContain("Identifies a tool or platform, not a model or provider.");
  });

  it("identifies the AI builder from its hosting domain even without HTML markers", () => {
    const r = analyzeFixture("removed-marker", { url: "https://bloom-yoga.lovable.app/" });
    expect(r.conclusion).toBe("strong_ai_evidence");
    expect(r.aiFindings[0]!.evidence[0]).toMatchObject({
      type: "url",
      value: "bloom-yoga.lovable.app",
    });
  });

  it("treats an explicit generator meta naming an AI tool as an explicit marker", () => {
    const bundle = bundleFromHtml(
      '<html><head><meta name="generator" content="v0.app"><title>x</title></head><body><p>Hello world, this is a page with enough words.</p></body></html>',
      {
        url: "https://example.com/",
        selectors: registry.requiredSelectors(),
      },
    );
    const r = analyze(bundle);
    const explicit = r.aiFindings.find((f) => f.detectorId === "ai.explicit-generator-marker")!;
    expect(explicit.evidenceStrength).toBe("strong");
    expect(explicit.evidenceKind).toBe("direct");
    // The v0 *signature* itself is experimental and therefore capped at weak.
    const sig = r.aiFindings.find((f) => f.signatureId === "v0")!;
    expect(sig.experimental).toBe(true);
    expect(sig.evidenceStrength).toBe("weak");
  });
});

describe("false-positive protection (negative fixtures)", () => {
  it("does not treat Next.js, React or Tailwind as AI evidence", () => {
    const r = analyzeFixture("framework-only");
    expect(names(r.platformFindings)).toEqual(
      expect.arrayContaining(["Next.js", "React", "Tailwind CSS", "webpack"]),
    );
    expect(r.aiFindings).toEqual([]);
    expect(r.conclusion).toBe("no_meaningful_evidence");
    for (const f of r.platformFindings) expect(f.category).toBe("platform");
  });

  it("does not flag an article that mentions and links to AI builders", () => {
    const r = analyzeFixture("ai-article");
    expect(r.aiFindings).toEqual([]);
    expect(r.conclusion).toBe("no_meaningful_evidence");
    expect(names(r.platformFindings)).toContain("Hugo");
  });

  it("regression: links to a WordPress URL do not identify WordPress", () => {
    const r = analyzeFixture("ai-article");
    expect(names(r.platformFindings)).not.toContain("WordPress");
  });

  it("does not infer AI from AI-generated image file names or alt text", () => {
    const r = analyzeFixture("ai-article");
    expect(r.aiFindings.filter((f) => f.evidence.some((e) => e.value?.includes("dalle")))).toEqual(
      [],
    );
  });

  it("reports no meaningful evidence when markers were removed", () => {
    const r = analyzeFixture("removed-marker");
    expect(r.conclusion).toBe("no_meaningful_evidence");
    expect(names(r.platformFindings)).not.toContain("Lovable (formerly GPT Engineer)");
    expect(r.rationale.join(" ")).toMatch(/does not show that no AI tools were used/);
  });

  it("keeps a hand-written page free of findings", () => {
    const r = analyzeFixture("basic-landing");
    expect(r.aiFindings).toEqual([]);
    expect(r.templateFindings).toEqual([]);
    expect(r.conclusion).toBe("no_meaningful_evidence");
  });
});

describe("template and boilerplate signals", () => {
  it("reports starter content and placeholders without changing the AI category", () => {
    const r = analyzeFixture("template-default");
    const ids = new Set(r.templateFindings.map((f) => f.detectorId));
    expect(ids).toEqual(
      new Set([
        "template.placeholder-text",
        "template.default-starter-content",
        "template.unreplaced-variables",
        "template.default-assets",
        "template.placeholder-links",
      ]),
    );
    expect(r.aiFindings).toEqual([]);
    expect(r.conclusion).toBe("no_meaningful_evidence");
    expect(r.rationale.join(" ")).toMatch(/do not affect the AI-origin category/);
  });
});

describe("ambiguous, conflicting and missing evidence", () => {
  it("keeps weak experimental indicators weak", () => {
    const r = analyzeFixture("ambiguous");
    expect(r.conclusion).toBe("weak_or_ambiguous");
    expect(r.aiFindings.every((f) => f.evidenceStrength === "weak")).toBe(true);
    expect(r.aiFindings.every((f) => f.experimental)).toBe(true);
  });

  it("never escalates many weak indicators into a stronger conclusion", () => {
    const weak: Finding = {
      id: "x#0",
      detectorId: "x",
      detectorVersion: "1.0.0",
      category: "ai_origin_signal",
      finding: "weak thing",
      evidenceStrength: "weak",
      evidenceKind: "indirect",
      source: "test",
      explanation: "test",
      evidence: [],
      alternativeExplanations: [],
      limitations: [],
      experimental: false,
    };
    const many = Array.from({ length: 25 }, (_, i) => ({ ...weak, id: `x#${i}` }));
    const cov = { ...emptyCoverage(), htmlInspected: true, visibleTextChars: 500 };
    expect(concludeAiOrigin(many, cov, [], "t").conclusion).toBe("weak_or_ambiguous");
  });

  it("keeps hosting-only association weak (Replit)", () => {
    const r = analyzeFixture("removed-marker", { url: "https://bloom.replit.app/" });
    expect(r.conclusion).toBe("weak_or_ambiguous");
    expect(r.platformIdentification.platforms.map((p) => p.name)).toContain("Replit");
  });

  it("surfaces conflicting platform evidence", () => {
    const r = analyzeFixture("conflicting");
    expect(r.conclusion).toBe("strong_ai_evidence");
    expect(names(r.platformFindings)).toEqual(
      expect.arrayContaining(["WordPress", "Lovable (formerly GPT Engineer)"]),
    );
    expect(r.conflicts.some((c) => c.includes("WordPress"))).toBe(true);
  });

  it("returns insufficient evidence for a bot-challenge page", () => {
    const r = analyzeFixture("challenge-page");
    expect(r.conclusion).toBe("insufficient_evidence");
    expect(r.coverage.blockingPageSuspected).toBe(true);
  });

  it("returns insufficient evidence for an empty shell with nothing to inspect", () => {
    expect(analyzeFixture("empty").conclusion).toBe("insufficient_evidence");
  });

  it("handles malformed HTML without throwing", () => {
    const bundle = bundleFromHtml(
      "<html><head><meta name=generator content='WordPress'><script src=>",
      {
        url: "https://example.com/",
        selectors: registry.requiredSelectors(),
      },
    );
    expect(() => analyze(bundle)).not.toThrow();
  });

  it("notes unavailable evidence types on platform findings", () => {
    const bundle = fixtureBundle("framework-only");
    const r = analyze(bundle);
    const next = r.platformFindings.find((f) => f.subject === "Next.js")!;
    expect(next.limitations.join(" ")).toMatch(/runtime_global/);
  });
});

describe("evidence preservation", () => {
  it("attaches explanation, evidence and versions to every finding", () => {
    for (const fixture of [
      "generator-marker",
      "framework-only",
      "template-default",
      "conflicting",
      "ambiguous",
    ]) {
      const r = analyzeFixture(fixture);
      for (const f of [...r.platformFindings, ...r.aiFindings, ...r.templateFindings]) {
        expect(f.explanation.length).toBeGreaterThan(10);
        expect(f.evidence.length).toBeGreaterThan(0);
        expect(f.detectorVersion).toMatch(/\d+\.\d+\.\d+/);
        for (const e of f.evidence) expect((e.value ?? "").length).toBeLessThanOrEqual(200);
      }
      expect(r.disclaimer).toMatch(/not calibrated probabilities/);
      expect(r.ruleSetVersion).toBe(registry.ruleSetVersion);
    }
  });

  it("redacts secret-looking values in evidence snippets", () => {
    const bundle = bundleFromHtml(
      "<html><head><title>x</title></head><body><!-- Generated with Lovable token=ghp_abcdefghijklmnopqrstuvwxyz0123456789 --><p>Enough visible words to count as content here.</p></body></html>",
      {
        url: "https://example.com/",
        selectors: registry.requiredSelectors(),
      },
    );
    const r = analyze(bundle);
    const f = r.aiFindings.find((x) => x.detectorId === "ai.explicit-generator-marker")!;
    expect(f.evidence[0]!.value).toContain("[redacted]");
    expect(f.evidence[0]!.value).not.toContain("ghp_");
  });
});
