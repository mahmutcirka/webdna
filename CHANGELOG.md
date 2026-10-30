# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Security (pre-release audit, 2026-10-30)

- Linear-time comment scanning in CSS/JS analysis (previously quadratic on unclosed comments).
- In-page measurement moved to a CDP isolated world with Node-side timeouts, so page scripts cannot forge or stall measurements.
- `Host`/`X-Forwarded-Host` allow-list (`WEBDNA_ALLOWED_HOSTS`) against DNS rebinding of the local API.
- Credential-like URL query values are redacted in reports, stored scan records, API responses, warnings, error messages and logs; the real URL is only kept in memory.
- Chromium's own host lookups for page hostnames (observed in its net-log) are disabled with `--host-resolver-rules`.
- Production-mode DNS-rebinding check (`npm run verify:prod-host`), run in CI after the build.
- Markdown and CSS/Tailwind exports escape or drop page-controlled content that could inject markup or rules.

### Fixed

- Explicit AI-marker rule no longer matches personal/company names (e.g. "Claude Dupont", "lovable care"); third-party script comments are capped at weak.
- Path-only platform signatures only match same-site resources.
- Dev UI hydrates when opened via `127.0.0.1`; locale-dependent formatting no longer causes hydration errors.

### Added

- Turkish interface (EN/TR switcher in the header). The language is chosen from a saved cookie or the browser's Accept-Language and rendered on the server; analysis-engine text (finding explanations, warnings) remains English and is labelled as such.
- Playwright end-to-end suite (`npm run test:e2e`) and CI job; SSRF canary and hostile-runtime integration tests.
- `WEBDNA_OFFLINE_DNS` for offline testing.

## [0.1.0] - 2026-10-30

### Added

- Browser analysis pipeline with nine reported stages, three viewport profiles (1440×900, 768×1024, 390×844), viewport and full-page screenshots.
- SSRF protection: URL normalisation, DNS validation of every address, per-scan filtering proxy with IP pinning, redirect re-validation, IPv4/IPv6 reserved-range blocking, transfer/connection/request/time limits.
- Design-system extraction (colours incl. modern colour spaces, typography, spacing with base-unit inference, radii, shadows, borders, declared custom properties) with inferred roles.
- Component-pattern, layout, accessibility and asset analysis.
- Static source analysis of HTML, CSS (css-tree) and JavaScript (acorn), same-origin source maps (paths only), naming conventions and source/runtime correlation.
- Responsive comparison across viewports.
- Detector framework: versioned rule registry, JSON signature sets (`platforms@2026.10.0`, `ai-builders@2026.10.0`), code rules for explicit AI markers and template signals, conclusion engine with five evidence categories, coverage and conflicts.
- Fastify API with bounded queue, cancellation, retention and file-based storage.
- Next.js UI: landing page with labelled sample report, dashboard, live stage progress, report workspace with evidence inspector, comparison and detector catalog; dark and light themes.
- Exports: JSON, CSS variables, Tailwind CSS v4 theme, Markdown, evidence ZIP.
- Unit, detector, API and browser integration tests; synthetic evaluation set; release checks; CI workflows.
