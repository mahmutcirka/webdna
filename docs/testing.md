# Testing guide

All tests run locally without internet access. Browser tests use Playwright's Chromium against fixture sites served on `127.0.0.1`; the test network policy allows only the fixture server's exact `host:port` and makes every other DNS lookup fail, so nothing leaves the machine.

| Suite           | Command                            | Covers                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit            | `npm test`                         | IPv4/IPv6 classification, URL normalisation, NetworkPolicy (mixed DNS answers, rebinding, ports), safe fetch pinning + redirects + size limits, proxy refusals and budgets, colour conversion (rgb/hsl/oklch/oklab/lab/display-p3), CSS/JS analysis, responsive comparison, design extraction, components, detectors, API lifecycle                                                                                   |
| Detectors       | `npm run test:detectors`           | Positive, negative, ambiguous, malformed, conflicting, insufficient and regression fixtures; experimental cap; weak-never-escalates; evidence preservation and redaction                                                                                                                                                                                                                                              |
| Integration     | `npm run test:integration`         | Full browser scans: all nine stages, three viewports, screenshots, tokens, components, responsive changes, accessibility, source analysis, exports, comparison; blocked private/metadata/IPv6 targets, redirects to private and metadata addresses, redirect loops, timeouts, transfer limit, cancellation, `file://`                                                                                                 |
| End-to-end      | `npm run test:e2e`                 | Playwright drives the real UI → API → worker → browser stack (`next dev` on 3311, API on 4311, fixtures on 4561/4562, DNS disabled): submission, live stages, report tabs, evidence inspector + screenshot, all five exports incl. ZIP contents, 375 px overflow on every page/tab, AI-builder evidence, invalid URL, blocked destination, DNS failure, cancellation, dashboard and compare                           |
| Security probes | part of `npm run test:integration` | A page using ~25 browser features (img, iframe, fetch, XHR, WebSocket, EventSource, beacon, popup, form, CSS @import/url, preconnect/prefetch, service worker, WebRTC) and redirects to loopback/IPv6/IPv4-mapped/hex forms must not reach a local canary service; a hostile page overriding built-ins must not forge or stall measurements. Passing shows these vectors were blocked here, not that no bypass exists |
| Evaluation      | `npm run eval`                     | Confusion matrix and binary metrics on the synthetic set                                                                                                                                                                                                                                                                                                                                                              |

Integration tests need Chromium: `npx playwright install chromium` (Linux CI: `--with-deps`).

## Fixtures

`fixtures/sites/*` are synthetic pages written for this repository (Apache-2.0). Their HTML comments explain what each one is for. None is copied from a real website; markers that imitate real products reproduce only publicly documented/observed marker strings.

| Fixture                   | Purpose                                                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `basic-landing`           | Hand-written page with responsive CSS, custom properties, a11y issues; used for full browser scans and the sample report |
| `framework-only`          | Next.js-style paths, React banner, Tailwind CSS — must yield no AI findings                                              |
| `generator-marker`        | Lovable markers (editor script, default meta)                                                                            |
| `removed-marker`          | Same app with markers removed                                                                                            |
| `template-default`        | Unchanged Vite starter + placeholders                                                                                    |
| `ai-article`              | Article mentioning/linking AI tools, AI-generated image (false-positive regression)                                      |
| `ambiguous`               | Only experimental weak indicators                                                                                        |
| `conflicting`             | WordPress + Lovable markers                                                                                              |
| `challenge-page`, `empty` | Insufficient evidence                                                                                                    |

## Writing tests

- Prefer fixtures over mocks for anything a detector reads.
- Keep integration tests offline (use the test policy in `tests/integration/scan.test.ts`).
- Never assert on real third-party sites in CI.
