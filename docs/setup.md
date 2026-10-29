# Local setup and troubleshooting

## Setup

```bash
npm install
npx playwright install chromium
npm run dev
```

- Web UI: <http://localhost:3000>
- API: <http://127.0.0.1:4100/api/health>

## Troubleshooting

**"The WebDNA API server did not respond"** — the API is not running or `WEBDNA_API_URL` points elsewhere. Check the `[server]` output of `npm run dev` and `curl http://127.0.0.1:4100/api/health`.

**`browserType.launch: Executable doesn't exist`** — run `npx playwright install chromium`. On minimal Linux images use `npx playwright install --with-deps chromium`.

**Every scan fails with `blocked_destination`** — the target resolves to a private/reserved address (common with corporate DNS, VPNs or split-horizon DNS), or uses a port outside `WEBDNA_ALLOWED_PORTS`. This is intentional.

**Scanning a local development site** — blocked by design. For local experiments only, set `WEBDNA_UNSAFE_ALLOW_LOOPBACK=127.0.0.1:5173` (exact host:port). Never set this on a shared or exposed host.

**`navigation_timeout` / `scan_timeout`** — slow sites; raise `WEBDNA_NAV_TIMEOUT_MS` / `WEBDNA_SCAN_TIMEOUT_MS`.

**`resource_limit`** — the page exceeded `WEBDNA_MAX_TOTAL_BYTES`, the request budget, or the redirect limit.

**"Insufficient evidence" on a site you can open** — many sites serve bot challenges to headless browsers. WebDNA does not try to bypass them.

**npm warns about install scripts (npm ≥ 11)** — esbuild's postinstall only verifies its binary; WebDNA works without it. Review with `npm install-scripts ls`.

**Windows** — all commands work in PowerShell and Git Bash. If `node` is not found after installing Node.js, open a new terminal.

## Data and privacy

Scan data lives in `data/` (git-ignored) and is deleted after `WEBDNA_RETENTION_DAYS`. Delete individual scans from the dashboard or with `DELETE /api/scans/:id`. Reports keep truncated, redacted snippets only — no full page text or downloaded files.

## API reference

| Method | Path                               | Description                                       |
| ------ | ---------------------------------- | ------------------------------------------------- |
| POST   | `/api/scans`                       | `{ url, viewports? }` → 202 `{ scan }`            |
| GET    | `/api/scans?limit=`                | Recent scans                                      |
| GET    | `/api/scans/:id`                   | Status with per-stage progress                    |
| GET    | `/api/scans/:id/report`            | Completed report (409 if not completed)           |
| POST   | `/api/scans/:id/cancel`            | Cancel a queued or running scan                   |
| DELETE | `/api/scans/:id`                   | Delete a finished scan and its files              |
| GET    | `/api/scans/:id/screenshots/:name` | `desktop-viewport.jpg`, `mobile-full.jpg`, …      |
| GET    | `/api/scans/:id/export/:format`    | `json`, `css`, `tailwind`, `markdown`, `evidence` |
| GET    | `/api/compare?a=&b=`               | Report comparison                                 |
| GET    | `/api/detectors`                   | Detector catalog with versions and limitations    |
| GET    | `/api/health`                      | Liveness and queue size                           |

Errors are `{ "error": { "code", "message", "details?" } }`.
