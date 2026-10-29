# Implementation status and pre-release audit (0.1.0)

Last audit: 2026-10-30. Legend: ✅ implemented **and** exercised by an automated test · 🔍 reviewed in code, not proven by a test · ⏳ open limitation.

A passing test shows that the tested input behaved as expected in this environment. It does not prove that a security property holds for all inputs.

## Audit findings and their status

| #   | Severity                       | Finding                                                                                                                                                                                                                                                                                                                                           | Status                                                                                                                                                                                                                                                                                                                  |
| --- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | High (DoS)                     | CSS comment extraction used `/\/\*[\s\S]*?\*\//g`, which is quadratic on unclosed comments: a 2 MB stylesheet blocked the event loop for **285 s** (measured).                                                                                                                                                                                    | ✅ Fixed with a linear `indexOf` scanner (`extractBlockComments`); 2 MB now completes in < 3 s (test). Same fix for JS banner fallback.                                                                                                                                                                                 |
| 2   | High (integrity / DoS)         | In-page measurement ran in the page's main JavaScript world. A hostile page that overrode `requestAnimationFrame`/`document.fonts` stalled the scan until the global timeout (measured: 90 s), and could have forged `getComputedStyle`.                                                                                                          | ✅ Fixed: measurement, font readiness and lazy-scroll run in a CDP isolated world with Node-side timeouts; runtime-global checks are bounded. Test: `hostile-runtime` fixture completes, real colours are measured, forged colour absent.                                                                               |
| 3   | Medium (local API exposure)    | No defence against DNS rebinding: a website re-pointing its domain to 127.0.0.1 could call the unauthenticated local API (directly or via the Next.js `/api` proxy).                                                                                                                                                                              | ✅ Fixed: `Host` and `X-Forwarded-Host` must be an allowed name (`WEBDNA_ALLOWED_HOSTS`). Tested on the API (unit), through `next dev` (E2E) and through `next start` + the bundled API (`npm run verify:prod-host`, 7/7, also in CI). `next start` replaces a client-supplied `X-Forwarded-Host` with the real `Host`. |
| 4   | Medium (incorrect attribution) | Explicit-marker rule matched ordinary words/names: "Made by Claude Dupont", "Built with lovable care", "Gemini Studio", "Copilot Travel" produced AI findings.                                                                                                                                                                                    | ✅ Fixed with specific product patterns; regression tests for false and true positives.                                                                                                                                                                                                                                 |
| 5   | Medium (incorrect attribution) | AI-marker comments inside **third-party** scripts (widgets/CDNs) counted as strong evidence about the site.                                                                                                                                                                                                                                       | ✅ Fixed: capped at weak, marked indirect, limitation names the third-party host.                                                                                                                                                                                                                                       |
| 6   | Medium (incorrect platform ID) | Path-only signatures (`/_next/static/`, `/wp-content/`, `/assets/index-*.js`) matched third-party resources.                                                                                                                                                                                                                                      | ✅ Fixed: path-only URL patterns apply to same-site resources only; host-anchored patterns unchanged. ⏳ Same-site uses last-two-labels, not the Public Suffix List.                                                                                                                                                    |
| 7   | Medium (data exposure)         | Credential-like query values (signed URLs, OAuth `code`, session ids) were stored verbatim in reports/exports.                                                                                                                                                                                                                                    | ✅ Fixed in `redactSecrets` and applied to redirect chain, canonical/favicon, not-inspected files, source-map URLs and library-banner file URLs. 🔍 Pattern-based; unusual parameter names are not caught.                                                                                                              |
| 8   | Medium (export injection)      | Markdown export inserted page-controlled text unescaped (HTML/links); CSS/Tailwind exports copied custom-property values that could close the block (`red}body{…}`) or were truncated mid-string.                                                                                                                                                 | ✅ Fixed: Markdown text escaped, code spans neutralised; CSS values validated (`safeCssValue`), invalid names dropped.                                                                                                                                                                                                  |
| 9   | Low (UX)                       | `next dev` blocked dev resources when opened via `127.0.0.1`, leaving the UI non-interactive.                                                                                                                                                                                                                                                     | ✅ Fixed (`allowedDevOrigins: ["127.0.0.1"]`); covered by E2E.                                                                                                                                                                                                                                                          |
| 10  | Low (UX)                       | Hydration mismatch on `/sample` from locale-dependent date/number formatting.                                                                                                                                                                                                                                                                     | ✅ Fixed; E2E fails on any hydration or page error.                                                                                                                                                                                                                                                                     |
| 11  | Medium (DNS leak)              | Measured with Chromium net-log: even in proxy mode Chromium issued its **own** host lookups for page hostnames (a real lookup of an unresolvable probe name failed with `NAME_NOT_RESOLVED`). Connections still went only to the proxy, but a page could make the scanner query attacker-chosen names (DNS exfiltration / internal-name probing). | ✅ Fixed with `--host-resolver-rules="MAP * ~NOTFOUND, EXCLUDE 127.0.0.1"`; net-log test asserts only `~notfound`/proxy are ever looked up, all TCP goes to the proxy, no QUIC session, and TCP/UDP canaries receive nothing.                                                                                           |
| 12  | Medium (data exposure)         | Credential-like parameters in the **user-submitted** URL were stored in `scan.json`, served by `/api/scans`, written to reports/exports, and embedded in browser error messages (`net::ERR_… at https://…?token=…`).                                                                                                                              | ✅ Fixed: records, report target URLs, warnings, stage/error messages and crash logs are redacted; the real URL is only held in memory for the worker. Tests: API list, report + all exports, real TLS navigation error.                                                                                                |

### SSRF review

✅ Tested with a local canary service that must receive **zero** requests:

- A page using ~25 features: `<img>`, `<iframe>`, `<script>`, stylesheet link, CSS `@import`/`url()`, preconnect, prefetch, `fetch`, XHR, WebSocket, EventSource, `sendBeacon`, `window.open`, form submission, service-worker registration, WebRTC STUN.
- Host forms tried by that page: `127.0.0.1`, `localhost`, `localhost.`, `127.1`, decimal, hex, octal, `[::1]`, `[::ffff:127.0.0.1]`, `0.0.0.0`. Separately, an IPv6-loopback canary.
- Redirects from an allowed page to `127.0.0.1`, `localhost`, `[::1]`, `[::ffff:7f00:1]` and `0x7f.1` all failed with `blocked_destination`.
- Earlier tests: redirects to `10.0.0.1` and `169.254.169.254` (never actually connected; refused by the policy), mixed public/private DNS answers, rebinding between two lookups, IP pinning in the safe fetcher, CONNECT to private addresses, connection and byte budgets, `file://`.

🔍 Reviewed assumptions (not proven):

- ✅ Measured (net-log test, Chromium 1.64.1 build on Windows): every TCP connection Chromium opened went to the proxy; page hostnames were never handed to a resolver after the fix; no QUIC session; the only UDP "connect" was Chromium's fixed IPv6-reachability probe to `[2001:4860:4860::8888]:443` (a UDP connect sends no payload). One run on one OS is evidence, not a guarantee for other builds or platforms.
- 🔍 Chromium may still pass the constant name `~notfound` to the OS resolver (a job is created for it); it carries no page-controlled data.
- 🔍 WebRTC media/ICE sockets are created by a separate service that net-log does not fully cover; the UDP canary saw no packets with `disable_non_proxied_udp`.
- 🔍 No HTTP/2 connection coalescing across tunnels is expected because Chromium never obtains target IPs in proxy mode.
- The per-scan proxy listens on 127.0.0.1 without authentication; other local processes could use it during a scan, but they are subject to the same policy.
- No protection against Chromium sandbox escapes is claimed.

### Source-analysis review

- ✅ Parsing is bounded (HTML 3 MB, CSS 2 MB, JS 1.5 MB parse / 3 MB capture, 80 files, 25 MB total, source maps 5 × 8 MB, same-origin only, paths only).
- ✅ No downloaded code is executed outside the isolated browser (test asserts acorn analysis has no side effects).
- 🔍 acorn/css-tree parsing is synchronous; a few large files can block the API event loop for seconds. Bounded, not eliminated.
- 🔍 All captured bodies are held in memory up to the per-scan transfer budget (64 MiB default).

## Feature status

- ✅ URL normalisation, IPv4/IPv6 range blocking, DNS validation with IP pinning, redirect re-validation, budgets, timeouts, cancellation
- ✅ Three viewports with screenshots; design tokens, roles, components, layout, accessibility observations, assets
- ✅ Responsive comparison; static source analysis; source ↔ runtime correlation
- ✅ Detector registry, signatures, code rules, experimental cap, conclusion engine; false-positive regression fixtures
- ✅ API lifecycle, bounded queue, retention, interrupted-scan recovery, path-traversal checks, Host allow-list
- ✅ Exports (JSON, CSS, Tailwind v4, Markdown, evidence ZIP) — contents verified in unit, integration and E2E tests
- ✅ UI end-to-end (Playwright): submission, live stages, report tabs, evidence inspector, exports, 375 px overflow, AI-builder evidence, invalid URL, blocked destination, DNS failure, cancellation, dashboard, compare, rebinding, hydration errors
- ✅ Synthetic evaluation: 12/12 cases match their designed category. **This is fixture coverage, not real-world AI-detection accuracy.**

## Remaining limitations

- ⏳ Most signatures are `public-knowledge`; they should be reproduced from freshly generated projects (`maintainer-observed`). The v0 generator marker is unverified and experimental.
- ⏳ No real-world labelled dataset; no real-world accuracy can be stated.
- ⏳ Same-site and third-party grouping approximate the Public Suffix List with the last two hostname labels.
- ⏳ CSS injected only via the CSSOM is invisible to source analysis.
- ⏳ No authentication or multi-user model; single-instance queue.
- ⏳ GitHub Actions use major-version tags (Dependabot-managed), not commit SHAs.
- ⏳ Next.js's optional `sharp` dependency installs LGPL-3.0 libvips binaries (not in the repository; see THIRD_PARTY_NOTICES.md).

## Release blockers

No code-level blockers remain from this audit. Before publishing, the maintainer must still:

1. Create `mahmutcirka/webdna` and enable **private vulnerability reporting** (SECURITY.md links to it), secret scanning and push protection.
2. Review that `docs/screenshots/*` and `apps/web/public/sample/*` show only the synthetic fixture and WebDNA itself.
3. Make the first commit and push (`docs/release.md`); CI has not yet run on GitHub-hosted runners (Linux), so Linux results for the browser tests are unverified.
