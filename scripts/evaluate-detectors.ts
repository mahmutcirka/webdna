/**
 * Runs the detector engine over the labelled synthetic fixtures in
 * fixtures/evaluation/manifest.json and reports a confusion matrix plus
 * precision / recall / false-positive rate for "AI-related evidence"
 * (strong or some) versus everything else.
 *
 *   npm run eval            # print results
 *   npm run eval -- --write # also update docs/evaluation-results.md
 *
 * IMPORTANT: these are synthetic fixtures written to exercise specific rules.
 * The numbers measure whether the rules behave as designed on those fixtures;
 * they are not an estimate of accuracy on real websites.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { AI_CONCLUSION_LABELS, type AiConclusion } from "@webdna/shared";
import { analyzeFixture, REPO_ROOT, registry } from "../packages/detectors/test/helpers.js";

interface Case {
  id: string;
  fixture: string;
  url: string;
  expected: AiConclusion;
  evidence: string;
}

const manifest = JSON.parse(
  readFileSync(path.join(REPO_ROOT, "fixtures/evaluation/manifest.json"), "utf8"),
) as {
  cases: Case[];
};
const LABELS = Object.keys(AI_CONCLUSION_LABELS) as AiConclusion[];
const matrix = new Map<string, number>();
const rows: { c: Case; actual: AiConclusion }[] = [];

for (const c of manifest.cases) {
  const actual = analyzeFixture(c.fixture, { url: c.url }).conclusion;
  rows.push({ c, actual });
  const key = `${c.expected}|${actual}`;
  matrix.set(key, (matrix.get(key) ?? 0) + 1);
}

const positive = (x: AiConclusion) => x === "strong_ai_evidence" || x === "some_ai_indicators";
let tp = 0,
  fp = 0,
  fn = 0,
  tn = 0;
for (const { c, actual } of rows) {
  if (positive(c.expected) && positive(actual)) tp += 1;
  else if (!positive(c.expected) && positive(actual)) fp += 1;
  else if (positive(c.expected) && !positive(actual)) fn += 1;
  else tn += 1;
}
const ratio = (a: number, b: number) => (b === 0 ? "n/a" : (a / b).toFixed(3));
const exact = rows.filter((r) => r.c.expected === r.actual).length;

const lines: string[] = [];
lines.push("# Detector evaluation on synthetic fixtures", "");
lines.push(
  "> **Scope:** these results come from hand-written synthetic fixtures (`fixtures/evaluation/manifest.json`). They check that the rules behave as designed. They are **not** a measurement of accuracy on real websites, and no real-world accuracy is claimed.",
  "",
);
lines.push(`Rule set: \`${registry.ruleSetVersion}\` · cases: ${rows.length}`, "");
lines.push(
  "## Per-case results",
  "",
  "| Case | Fixture | Expected | Actual | |",
  "|---|---|---|---|---|",
);
for (const { c, actual } of rows) {
  lines.push(
    `| ${c.id} | ${c.fixture} | ${c.expected} | ${actual} | ${c.expected === actual ? "✓" : "✗"} |`,
  );
}
lines.push("", "## Confusion matrix (rows = expected, columns = actual)", "");
lines.push(
  `| expected \\ actual | ${LABELS.join(" | ")} |`,
  `|---|${LABELS.map(() => "---").join("|")}|`,
);
for (const e of LABELS)
  lines.push(`| ${e} | ${LABELS.map((a) => matrix.get(`${e}|${a}`) ?? 0).join(" | ")} |`);
lines.push("", "## Binary view: AI-related evidence (strong or some) vs. not", "");
lines.push(`- Exact category agreement on synthetic fixtures: ${exact}/${rows.length}`);
lines.push(`- TP ${tp} · FP ${fp} · FN ${fn} · TN ${tn}`);
lines.push(
  `- On these synthetic fixtures only — not real-world performance: precision ${ratio(tp, tp + fp)} · recall ${ratio(tp, tp + fn)} · false-positive rate ${ratio(fp, fp + tn)}`,
);
lines.push(
  "",
  "With this few synthetic cases, these figures only show whether regressions occurred.",
  "",
);

const output = lines.join("\n");
console.log(output);
if (process.argv.includes("--write")) {
  writeFileSync(path.join(REPO_ROOT, "docs", "evaluation-results.md"), output);
  console.log("Wrote docs/evaluation-results.md");
}
if (exact !== rows.length) process.exitCode = 1;
