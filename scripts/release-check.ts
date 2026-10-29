/**
 * Pre-publication checks. Run before making the repository public:
 *
 *   npm run check:release
 *
 * - Lists the files Git would publish (tracked + untracked-but-not-ignored).
 * - Fails on likely secrets, committed env files, scan data, local databases,
 *   oversized files and unexpected binary artefacts.
 * - Flags unsupported claims in Markdown (percent-AI wording, invented badges).
 */
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const problems: string[] = [];
const notes: string[] = [];

function publishableFiles(): string[] {
  try {
    const out = execFileSync(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
      { cwd: ROOT, encoding: "utf8" },
    );
    return out.split("\0").filter(Boolean);
  } catch {
    throw new Error("This check needs a Git repository (run `git init` first).");
  }
}

const SECRET_PATTERNS: [string, RegExp][] = [
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
  ["GitHub token", /\bgh[pousr]_[A-Za-z0-9]{36,}\b/],
  ["OpenAI/Anthropic-style key", /\bsk-(ant-)?[A-Za-z0-9_-]{32,}\b/],
  ["Slack token", /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{35}\b/],
  ["Private key", /-----BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY-----/],
  ["Stripe live key", /\b(sk|rk)_live_[A-Za-z0-9]{20,}\b/],
];
// Test files intentionally contain fake token shapes to exercise redaction.
const SECRET_ALLOWLIST = [
  /^packages\/detectors\/test\//,
  /^packages\/shared\/src\/text\.ts$/,
  /^scripts\/release-check\.ts$/,
];

const FORBIDDEN_PATHS: [string, RegExp][] = [
  ["environment file", /(^|\/)\.env(\.(?!example$)[^/]+)?$/],
  ["scan data directory", /^data\//],
  ["local database", /\.(sqlite3?|db)$/],
  ["build output", /(^|\/)(dist|\.next|out|coverage)\//],
  ["dependency folder", /(^|\/)node_modules\//],
  ["log file", /\.log$/],
];
const ALLOWED_BINARY = [
  /^apps\/web\/public\/sample\/(desktop|tablet|mobile)-viewport\.jpg$/,
  // README screenshots of the app showing only the synthetic sample report.
  /^docs\/screenshots\/[a-z-]+\.png$/,
];

const files = publishableFiles();
for (const file of files) {
  for (const [label, re] of FORBIDDEN_PATHS)
    if (re.test(file)) problems.push(`${file}: ${label} must not be published`);
  const size = statSync(path.join(ROOT, file)).size;
  if (size > 2_000_000)
    problems.push(`${file}: ${(size / 1e6).toFixed(1)} MB is unexpectedly large`);
  if (
    /\.(png|jpe?g|gif|webp|zip|pdf|woff2?|ttf)$/i.test(file) &&
    !ALLOWED_BINARY.some((r) => r.test(file))
  ) {
    problems.push(
      `${file}: unexpected binary file (screenshots or downloaded assets must not be committed)`,
    );
  }
  if (size > 5_000_000 || /\.(png|jpe?g|gif|webp|zip|pdf|woff2?|ttf)$/i.test(file)) continue;
  const text = readFileSync(path.join(ROOT, file), "utf8");
  if (!SECRET_ALLOWLIST.some((r) => r.test(file))) {
    for (const [label, re] of SECRET_PATTERNS)
      if (re.test(text)) problems.push(`${file}: possible ${label}`);
  }
  if (file.endsWith(".md")) {
    if (/\b\d{1,3}(\.\d+)?\s?% (AI|ai)[- ]generated/.test(text))
      problems.push(`${file}: "% AI-generated" wording is not allowed`);
    if (/img\.shields\.io\/(github\/stars|npm\/dt|github\/downloads)/.test(text))
      problems.push(`${file}: star/download badges must not be invented`);
  }
}

const sample = files.find((f) => f.endsWith("sample-report.json"));
if (sample) {
  const text = readFileSync(path.join(ROOT, sample), "utf8");
  if (!text.includes('"sample"'))
    problems.push(`${sample}: sample report must carry a "sample" label`);
  notes.push(
    `${sample}: generated from a synthetic fixture (check label present: ${text.includes('"sample"')})`,
  );
}
if (!files.includes("LICENSE")) problems.push("LICENSE file missing");

console.log(`Checked ${files.length} publishable files.`);
for (const n of notes) console.log(`note: ${n}`);
if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(
  "No release blockers found by automated checks. Review the manual checklist in docs/release.md.",
);
