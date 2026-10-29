import { strToU8, zipSync } from "fflate";
import type { Finding, Report } from "@webdna/shared";

/**
 * Neutral, numbered names are used for measured tokens because WebDNA does not know
 * the site's own token names. Custom properties declared in the site's CSS are kept
 * under their real names in a separate block, since those names were observed.
 */
function roleFor(report: Report, value: string): string | undefined {
  return report.design.roles.find((r) => r.value === value)?.role;
}

function cssComment(text: string): string {
  return text.replace(/\*\//g, "* /").replace(/[\r\n]+/g, " ");
}

/**
 * Values copied into CSS output come from the analysed page. Reject anything that could
 * end the declaration, open/close a block or comment, or that was truncated for storage.
 */
export function safeCssValue(value: string): string | undefined {
  const v = value.trim();
  if (!v || v.length > 300) return undefined;
  if (/[{};<>\\]|\/\*|\*\/|…$/.test(v)) return undefined;
  if ((v.match(/"/g) ?? []).length % 2 !== 0 || (v.match(/'/g) ?? []).length % 2 !== 0) {
    return undefined;
  }
  let depth = 0;
  for (const ch of v) {
    if (ch === "(") depth += 1;
    else if (ch === ")" && --depth < 0) return undefined;
  }
  return depth === 0 ? v : undefined;
}

const CUSTOM_PROPERTY_NAME = /^--[A-Za-z0-9_-]{1,100}$/;

function pushToken(lines: string[], name: string, value: string, comment = ""): void {
  const safe = safeCssValue(value);
  if (safe !== undefined) lines.push(`  ${name}: ${safe};${comment}`);
}

export function exportJson(report: Report): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function exportCssVariables(report: Report): string {
  const d = report.design;
  const lines: string[] = [
    `/* WebDNA design tokens — measured from ${cssComment(report.target.finalUrl)} on ${report.createdAt}`,
    ` * Names are neutral (observed-N). Comments note usage counts and inferred roles,`,
    ` * which are heuristics, not the site's own naming. */`,
    ":root {",
  ];
  d.colors.slice(0, 32).forEach((c, i) => {
    const role = roleFor(report, c.hex);
    lines.push(
      `  --webdna-color-${i + 1}: ${c.hex}; /* ${c.count}× ${Object.keys(c.properties).join(", ")}${role ? ` · inferred: ${role}` : ""} */`,
    );
  });
  d.typography.families
    .slice(0, 6)
    .forEach((f, i) => pushToken(lines, `--webdna-font-${i + 1}`, f.stack));
  d.typography.sizeScalePx.forEach((s, i) => lines.push(`  --webdna-text-${i + 1}: ${s}px;`));
  d.spacing
    .filter((s) => s.px !== undefined)
    .sort((a, b) => (a.px ?? 0) - (b.px ?? 0))
    .slice(0, 24)
    .forEach((s, i) => pushToken(lines, `--webdna-space-${i + 1}`, s.value, ` /* ${s.count}× */`));
  d.radii
    .slice(0, 12)
    .forEach((r, i) => pushToken(lines, `--webdna-radius-${i + 1}`, r.value, ` /* ${r.count}× */`));
  d.shadows
    .slice(0, 8)
    .forEach((s, i) => pushToken(lines, `--webdna-shadow-${i + 1}`, s.value, ` /* ${s.count}× */`));
  lines.push("}");

  if (d.customProperties.length > 0) {
    lines.push(
      "",
      "/* Custom properties declared in the site's own CSS (original names). */",
      ":root {",
    );
    for (const p of d.customProperties.slice(0, 200)) {
      if (CUSTOM_PROPERTY_NAME.test(p.name)) pushToken(lines, p.name, p.value);
    }
    lines.push("}");
  }
  return `${lines.join("\n")}\n`;
}

/** Tailwind CSS v4 CSS-first theme (`@theme`). Produces utilities such as bg-observed-1. */
export function exportTailwindTheme(report: Report): string {
  const d = report.design;
  const lines: string[] = [
    `/* WebDNA → Tailwind CSS v4 theme, measured from ${cssComment(report.target.finalUrl)}`,
    ` * Usage: @import "tailwindcss"; @import "./webdna-theme.css";`,
    ` * Names are neutral (observed-N); see the JSON report for evidence. */`,
    "@theme {",
  ];
  d.colors.slice(0, 32).forEach((c, i) => {
    const role = roleFor(report, c.hex);
    lines.push(`  --color-observed-${i + 1}: ${c.hex};${role ? ` /* inferred: ${role} */` : ""}`);
  });
  d.typography.families
    .slice(0, 6)
    .forEach((f, i) => pushToken(lines, `--font-observed-${i + 1}`, f.stack));
  d.typography.sizeScalePx.forEach((s, i) =>
    lines.push(`  --text-observed-${i + 1}: ${s / 16}rem;`),
  );
  if (d.spacingBase)
    lines.push(
      `  --spacing: ${d.spacingBase.basePx / 16}rem; /* inferred base unit, ${Math.round(d.spacingBase.share * 100)}% of values are multiples */`,
    );
  d.radii.slice(0, 12).forEach((r, i) => pushToken(lines, `--radius-observed-${i + 1}`, r.value));
  d.shadows.slice(0, 8).forEach((s, i) => pushToken(lines, `--shadow-observed-${i + 1}`, s.value));
  lines.push("}");
  return `${lines.join("\n")}\n`;
}

/** Page-controlled text outside code spans: neutralise HTML, links, emphasis and tables. */
function mdEscape(s: string): string {
  return s
    .replace(/[\r\n]+/g, " ")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/([\\`*_[\]|!])/g, "\\$1");
}

/** Text inside a code span: only backticks, pipes and newlines need neutralising. */
function mdCode(s: string): string {
  return s
    .replace(/[\r\n]+/g, " ")
    .replace(/`/g, "'")
    .replace(/\|/g, "\\|");
}

function findingLines(findings: Finding[]): string[] {
  if (findings.length === 0) return ["_None._", ""];
  const out: string[] = [];
  for (const f of findings) {
    out.push(
      `- **${mdEscape(f.finding)}** — ${f.evidenceStrength}, ${f.evidenceKind}${f.experimental ? ", experimental rule" : ""} (\`${f.detectorId}@${f.detectorVersion}\`)`,
    );
    out.push(`  - ${mdEscape(f.explanation)}`);
    for (const e of f.evidence.slice(0, 3))
      out.push(
        `  - Evidence: ${e.type} at \`${mdCode(e.location)}\`${e.value ? `: \`${mdCode(e.value)}\`` : ""}`,
      );
    if (f.alternativeExplanations.length > 0)
      out.push(
        `  - Alternative explanations: ${f.alternativeExplanations.map(mdEscape).join("; ")}`,
      );
  }
  out.push("");
  return out;
}

export function exportMarkdown(report: Report): string {
  const d = report.design;
  const ai = report.aiOrigin;
  const L: string[] = [];
  L.push(`# WebDNA report: ${mdEscape(report.metadata.title ?? report.target.domain)}`, "");
  if (report.sample) L.push(`> **${report.sample.label}**`, "");
  L.push("| | |", "|---|---|");
  L.push(
    `| Target URL | ${mdEscape(report.target.inputUrl)} |`,
    `| Final URL | ${mdEscape(report.target.finalUrl)} |`,
  );
  L.push(
    `| Scanned | ${report.createdAt} (${Math.round(report.durationMs / 1000)} s) |`,
    `| HTTP status | ${report.target.statusCode ?? "?"} |`,
  );
  L.push(
    `| Viewports | ${report.viewports.map((v) => `${v.id} ${v.width}×${v.height}`).join(", ")} |`,
  );
  L.push(`| Report schema | ${report.schemaVersion} · rule set ${ai.ruleSetVersion} |`, "");

  if (report.warnings.length > 0) {
    L.push("## Warnings", "", ...report.warnings.map((w) => `- ${mdEscape(w.message)}`), "");
  }

  L.push(
    "## Design tokens (measured)",
    "",
    "| Colour | Uses | Properties | Inferred role |",
    "|---|---|---|---|",
  );
  for (const c of d.colors.slice(0, 20))
    L.push(
      `| \`${c.hex}\` | ${c.count} | ${Object.keys(c.properties).join(", ")} | ${roleFor(report, c.hex) ?? ""} |`,
    );
  L.push(
    "",
    "**Font families:** " +
      (d.typography.families.map((f) => `${f.family} (${f.count})`).join(", ") || "none"),
    "",
  );
  L.push("**Font sizes (px):** " + (d.typography.sizeScalePx.join(", ") || "none"), "");
  L.push(
    "**Spacing:** " +
      d.spacing
        .slice(0, 16)
        .map((s) => `${s.value} (${s.count})`)
        .join(", "),
    "",
  );
  if (d.spacingBase)
    L.push(
      `_Inferred spacing base: ${d.spacingBase.basePx}px (${Math.round(d.spacingBase.share * 100)}% of values, ${d.spacingBase.confidence} confidence)._`,
      "",
    );
  L.push("**Radii:** " + (d.radii.map((r) => `${r.value} (${r.count})`).join(", ") || "none"), "");
  L.push(
    "**Shadows:** " + (d.shadows.length ? "" : "none"),
    ...d.shadows.slice(0, 6).map((s) => `- \`${mdCode(s.value)}\` (${s.count})`),
    "",
  );

  L.push("### Inferred roles", "", "Roles are heuristic interpretations of measured values.", "");
  for (const r of d.roles)
    L.push(
      `- **${r.role}**: \`${mdCode(r.value)}\` — ${r.confidence} confidence. ${mdEscape(r.basis)}`,
    );
  L.push("");

  L.push(
    "## Components (heuristic visual patterns)",
    "",
    "| Pattern | Variant | Count | Confidence |",
    "|---|---|---|---|",
  );
  for (const c of report.components.slice(0, 30))
    L.push(`| ${c.kind} | ${mdEscape(c.variant)} | ${c.count} | ${c.confidence} |`);
  L.push("");

  L.push("## Responsive findings", "");
  if (report.responsive.changes.length === 0) L.push("_No differences recorded._");
  for (const r of report.responsive.changes.slice(0, 40))
    L.push(
      `- ${r.severity === "potential_issue" ? "⚠ " : ""}${r.from} → ${r.to}: ${mdEscape(r.description)}${r.selector ? ` (\`${mdCode(r.selector)}\`)` : ""}`,
    );
  L.push(
    "",
    `Declared breakpoints: ${report.responsive.breakpointsDeclared.join(", ") || "none found"}`,
    "",
  );

  L.push("## Accessibility observations", "", `_${report.accessibility.note}_`, "");
  if (report.accessibility.issues.length === 0)
    L.push("_No issues found by the automated checks._");
  for (const i of report.accessibility.issues)
    L.push(`- [${i.severity}] ${mdEscape(i.message)} (${i.count}×)`);
  L.push("");

  L.push("## Source analysis", "");
  const s = report.source;
  L.push(
    `- HTML: ${s.html.inspected ? `${s.html.bytes} bytes, ${s.html.commentCount} comments, ${s.html.externalScripts} external scripts` : "not inspected"}`,
  );
  L.push(
    `- CSS: ${s.css.filesInspected} files, ${s.css.ruleCount} rules, ${s.css.customPropertyCount} custom properties, breakpoints ${s.css.breakpointsPx.join("/") || "none"}`,
  );
  L.push(
    `- JavaScript: ${s.js.filesInspected} files (${s.js.parsed} parsed, ${s.js.minifiedLikely} likely minified)`,
  );
  for (const n of s.css.namingConventions)
    L.push(
      `- Naming convention: ${n.convention} (${Math.round(n.share * 100)}% of class tokens, ${n.confidence})`,
    );
  for (const c of s.correlations)
    L.push(
      `- Correlation — ${mdEscape(c.topic)}: ${c.status}. Source: ${mdEscape(c.sourceEvidence)}. Runtime: ${mdEscape(c.runtimeEvidence)}.`,
    );
  L.push("", ...s.limitations.map((l) => `- _${mdEscape(l)}_`), "");

  L.push(
    "## AI-origin analysis",
    "",
    `**Evidence category: ${ai.conclusionLabel}**`,
    "",
    ...ai.rationale.map((r) => `- ${mdEscape(r)}`),
    "",
  );
  L.push("### Website platform identified", "");
  L.push(
    ai.platformIdentification.platforms.length
      ? ai.platformIdentification.platforms
          .map((p) => `- ${p.name} (${p.type}, ${p.strength})`)
          .join("\n")
      : "_No platform identified._",
    "",
  );
  L.push(
    "### Evidence potentially associated with AI-assisted generation",
    "",
    ...findingLines(ai.aiFindings),
  );
  L.push("### Template and boilerplate signals", "", ...findingLines(ai.templateFindings));
  if (ai.conflicts.length)
    L.push("### Conflicting evidence", "", ...ai.conflicts.map((c) => `- ${mdEscape(c)}`), "");
  L.push(
    "### Limitations",
    "",
    `- ${ai.disclaimer}`,
    ...ai.coverage.notes.map((n) => `- ${mdEscape(n)}`),
    "",
  );
  L.push("### Detectors", "", "| Detector | Version | Status | Findings |", "|---|---|---|---|");
  for (const det of ai.detectors)
    L.push(
      `| ${det.id} | ${det.version} | ${det.status}${det.error ? " (error)" : ""} | ${det.findingCount} |`,
    );
  L.push("");
  return `${L.join("\n")}\n`;
}

/** Zip of the JSON report and its screenshots. No third-party page assets are included. */
export function exportEvidenceZip(
  report: Report,
  screenshots: Record<string, Uint8Array>,
): Uint8Array {
  const files: Record<string, Uint8Array> = {
    "report.json": strToU8(exportJson(report)),
    "README.txt": strToU8(
      [
        `WebDNA evidence bundle for ${report.target.finalUrl}`,
        `Scan ${report.scanId} at ${report.createdAt}.`,
        "Contains the versioned report and screenshots captured by WebDNA.",
        "Screenshots depict a third-party website; check its terms before redistributing them.",
        "",
      ].join("\n"),
    ),
  };
  for (const [name, data] of Object.entries(screenshots)) files[`screenshots/${name}`] = data;
  return zipSync(files, { level: 6 });
}
