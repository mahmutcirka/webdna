# Architecture

WebDNA is an npm-workspaces monorepo with two apps and three packages. It deliberately avoids infrastructure it does not need: there is no database, Redis or message broker. A scan is one job in a bounded in-process queue; its state and report are JSON files.

## Components

```mermaid
flowchart TB
  subgraph Browser["User's browser"]
    UI[Next.js UI]
  end
  subgraph Web["apps/web (Next.js)"]
    Pages["Landing · Dashboard · Scan · Compare · Detectors · Sample"]
    Rewrite["/api/* rewrite"]
  end
  subgraph Server["apps/server (Fastify, 127.0.0.1:4100)"]
    Routes["REST routes (Zod-validated)"]
    Queue["ScanQueue<br/>concurrency + max queue + cancellation"]
    Store["ScanStore<br/>data/scans/&lt;uuid&gt;/"]
  end
  subgraph Core["packages/analysis-core"]
    Policy["NetworkPolicy<br/>URL + DNS + IP validation"]
    Proxy["Filtering proxy (per scan)"]
    Session["Browser session<br/>Playwright Chromium"]
    Extract["Extraction: design · components · layout · a11y · assets"]
    Source["Source analysis: htmlparser2 · css-tree · acorn · source maps"]
    Resp["Responsive comparison"]
    Export["Exports · report diff"]
  end
  Det["packages/detectors<br/>registry · signatures · rules · conclusion"]
  Shared["packages/shared<br/>schemas"]

  UI --> Pages --> Rewrite --> Routes
  Routes --> Queue --> Core
  Routes --> Store
  Queue --> Store
  Session -- "--proxy-server" --> Proxy --> Policy
  Source -- "safeFetch (source maps)" --> Policy
  Core --> Det
```

## Scan lifecycle

```mermaid
sequenceDiagram
  participant UI
  participant API
  participant Queue
  participant Pipeline
  participant Proxy
  participant Chromium
  UI->>API: POST /api/scans {url, viewports}
  API->>API: normalizeTargetUrl (scheme, credentials, local names)
  API->>Queue: enqueue (429 if queue full)
  API-->>UI: 202 {scan}
  loop every second
    UI->>API: GET /api/scans/:id (stage states)
  end
  Queue->>Pipeline: runScan(signal, onStage)
  Pipeline->>Pipeline: 1 validate: resolve DNS, every address must be public
  Pipeline->>Proxy: 2 start per-scan proxy (byte/connection budget)
  Pipeline->>Chromium: launch with proxy, QUIC/WebRTC off
  Chromium->>Proxy: CONNECT host:443
  Proxy->>Proxy: resolve → validate → connect to that IP
  Pipeline->>Chromium: 3 load (domcontentloaded, load, network idle, fonts, scroll)
  Pipeline->>Chromium: 4 per viewport: extract DOM/CSS + screenshots
  Pipeline->>Pipeline: 5 components, layout, a11y, assets, source analysis
  Pipeline->>Pipeline: 6 design tokens + inferred roles
  Pipeline->>Pipeline: 7 evidence bundle → detectors → conclusion
  Pipeline->>Pipeline: 8 viewport comparison + source/runtime correlation
  Pipeline->>Pipeline: 9 assemble + validate with ReportSchema
  Queue->>API: save report.json, mark completed
  UI->>API: GET /api/scans/:id/report
```

Failure states use stable error codes (`invalid_url`, `blocked_destination`, `dns_failure`, `navigation_failed`, `navigation_timeout`, `resource_limit`, `scan_timeout`, `cancelled`, `interrupted`, `internal_error`). A failed scan never produces a report. Scans left running when the server stops are marked `interrupted` at the next start.

## Data model

- **ScanRecord** (`scan.json`): id, URLs, status, per-stage state/message/timestamps, warnings, error, summary.
- **Report** (`report.json`, schema version `1.0.0`): target, metadata, per-viewport observations, design system, layout, components, responsive changes, accessibility, assets, source analysis, AI-origin report, warnings, applied limits.
- **Finding**: detector id/version, optional signature id/version, category (`platform` | `ai_origin_signal` | `template_signal`), subject, strength, direct/indirect, explanation, evidence references, alternative explanations, limitations, experimental flag.

All contracts live in `packages/shared` as Zod schemas; the server validates every report before saving it.

## Measured vs. inferred

| Measured (observed directly)                     | Inferred (heuristic, labelled as such)                               |
| ------------------------------------------------ | -------------------------------------------------------------------- |
| Computed colours, fonts, spacing, radii, shadows | Colour/font roles ("primary text", "accent") with basis + confidence |
| Element rectangles, display/flex/grid values     | Component patterns (button, card, badge…)                            |
| Media queries, custom properties in CSS          | Spacing base unit                                                    |
| Generator tags, headers, asset paths, comments   | Platform identity; AI association; template reuse                    |

## Why no database / Redis

A single WebDNA instance runs at most a handful of browser scans in parallel. Reports are immutable documents that are always read whole, and listing a few hundred directories is cheap. If you need multi-instance deployment, the `ScanQueue` and `ScanStore` interfaces are the seams to replace with BullMQ/PostgreSQL.
