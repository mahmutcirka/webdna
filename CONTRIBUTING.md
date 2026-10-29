# Contributing to WebDNA

Thanks for helping! WebDNA's credibility depends on careful, evidence-based changes, so please read this first.

## Getting started

```bash
npm install
npx playwright install chromium
npm run dev
```

Before opening a pull request:

```bash
npm run format:check && npm run lint && npm run typecheck
npm run test:all
npm run eval
```

## What we welcome

- New or improved **platform signatures** with documentation or a reproducible fixture.
- **False-positive reports** with a minimal synthetic fixture that reproduces the issue (please do not commit copies of real websites).
- Extraction, responsive-analysis and accessibility improvements with tests.
- Documentation, UI and accessibility fixes.

## Rules for detector changes

1. Every new rule needs positive and negative tests (see `docs/detectors.md`).
2. Markers you have not reproduced yourself must be `experimental` with `community-reported` provenance.
3. Never use visual appearance, layout, popular class names or image content as AI evidence.
4. Never claim to identify a model or provider.
5. Bump the signature/detector version on any behavioural change and add a `CHANGELOG.md` entry.
6. If a conclusion changes for an evaluation case, explain why in the PR.

## Data and legal

- Do not commit scan output (`data/`), screenshots of third-party sites, downloaded assets or proprietary rule sets.
- Do not scrape websites to build labelled datasets without a license and a documented, consent-respecting labelling protocol.
- By contributing you agree your contribution is licensed under Apache-2.0.

## Pull requests

Keep PRs focused, describe the evidence for any signature, and fill in the PR template. CI must pass.

## Code style

TypeScript strict mode, Prettier formatting, ESLint. Prefer small pure functions in `analysis-core`, keep browser-side code in `browser/extract-script.ts` read-only, and treat all page content as untrusted data.
