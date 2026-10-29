# Detector development guide

Detectors live in `packages/detectors`. They read an **EvidenceBundle** (built by the pipeline from the safe browser session, or by `bundleFromHtml()` in tests) and return structured findings. They never fetch anything themselves.

## Two kinds of rules

1. **Signatures** (`signatures/*.json`) — data-only fingerprints. Use these for platforms, hosts, frameworks, build tools and AI builders.
2. **Code rules** (`src/rules/*.ts`) — logic that does not fit matchers, e.g. placeholder-text detection or explicit generator comments.

The registry (`src/default-registry.ts`) loads every signature set, validates it with Zod, and registers code rules. The rule-set version recorded in reports is `engine@<ENGINE_RULES_VERSION>+<set>@<version>…`.

## Adding a signature

```jsonc
{
  "id": "examplebuilder", // lowercase, unique within the set
  "version": "1.0.0", // bump on any change
  "name": "Example Builder",
  "subjectType": "website_builder", // framework | cms | website_builder | ai_builder | hosting | cdn | build_tool | css_framework | library
  "status": "active", // active | experimental | disabled
  "provenance": {
    "type": "documented", // documented | maintainer-observed | public-knowledge | community-reported
    "reference": "https://vendor.example/docs/generator-tag",
    "lastReviewed": "2026-10-29",
  },
  "description": "What the platform emits and why it identifies it.",
  "matchers": [
    {
      "type": "meta",
      "name": "generator",
      "pattern": "^Example Builder\\b",
      "strength": "strong",
      "kind": "direct",
      "explanation": "…",
    },
    {
      "type": "asset_path",
      "pattern": "^https?://cdn\\.examplebuilder\\.com/",
      "strength": "moderate",
      "kind": "direct",
      "explanation": "…",
    },
  ],
  "aiAssociation": {
    // only for platforms whose primary workflow is AI generation
    "maxStrength": "moderate",
    "rationale": "Why this platform implies AI-assisted generation.",
    "alternativeExplanations": ["…"],
  },
  "limitations": ["…"],
  "falsePositiveConsiderations": ["…"],
}
```

Matcher types: `hostname`, `meta` (`name` or `property`), `header` (optional `pattern`), `html_comment`, `script_url`, `stylesheet_url`, `asset_path` (resources the page loads — never `<a href>`), `dom_selector` (evaluated in the rendered page and the static HTML), `runtime_global` (`name in window`), `js_source`, `css_source`, `source_map_path`. Patterns are case-insensitive JavaScript regexes.

### Rules for AI-related signatures

- A marker that has not been reproduced by a maintainer **must** be `"status": "experimental"` with `"provenance.type": "community-reported"` (enforced by a test). Experimental findings are capped at weak.
- Do not use visual style, layout, class names shared by popular libraries, or image content.
- Keep `aiAssociation.maxStrength` honest: hosting on a general-purpose platform is weak at best.
- Never attribute a model or provider.

### External signature databases

If you import signatures from an external database, document its source, license, version and update process in the PR and in this file. Do not add unlicensed or proprietary rule sets.

## Adding a code rule

Implement the `Detector` interface (`src/types.ts`): id, name, version, category, description, `evidenceRequirements`, `maxStrength`, limitations, false-positive considerations, status, provenance, fixtures and `detect(bundle)`. Return `DetectorResult`s with concrete `evidence` references (location + truncated value via `safeSnippet`). Register it in `createDefaultRegistry()`.

## Tests you must add

- A positive fixture (`fixtures/sites/<name>/index.html`) and a test that asserts the finding, its strength and its evidence.
- A negative fixture or an existing one (`framework-only`, `ai-article`, `basic-landing`) proving no false positive.
- Ambiguous/malformed input if relevant.
- If the rule changes a conclusion, add or update a case in `fixtures/evaluation/manifest.json` and run `npm run eval -- --write`.

Run `npm run test:detectors` and `npm run eval`.

## Disabling or retiring a rule

- Temporarily: set `WEBDNA_DISABLED_DETECTORS=sig.ai-builders.example,template.placeholder-links`.
- Permanently: set `"status": "disabled"` (signatures) or `status: "disabled"` (code rules), bump the version, and note it in `CHANGELOG.md`. Reports record every detector's id, version and whether it ran, so comparisons show when a change came from a rule.

## Current signature provenance

Initial signatures were written from vendor documentation and widely known default markup (`public-knowledge`). The Lovable markers were cross-checked against publicly visible Lovable-generated `index.html` files on 2026-10-29. A v0 generator-tag claim could not be confirmed and ships as experimental. Please help by reproducing markers from freshly generated projects and upgrading provenance to `maintainer-observed` with a fixture.
