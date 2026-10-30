import path from "node:path";
import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";
import { ZodError, z } from "zod";
import {
  CreateScanRequestSchema,
  EXPORT_FORMATS,
  PROMPT_STACKS,
  buildRebuildPrompt,
  redactSecrets,
  type ExportFormat,
} from "@webdna/shared";
import { createDefaultRegistry, type DetectorRegistry } from "@webdna/detectors";
import {
  NetworkPolicy,
  ScanFailure,
  compareReports,
  exportCssVariables,
  exportEvidenceZip,
  exportJson,
  exportMarkdown,
  exportTailwindTheme,
  normalizeTargetUrl,
  runScan,
} from "@webdna/analysis-core";
import type { ServerConfig } from "./config.js";
import { ScanQueue, type ScanRunner } from "./queue.js";
import { SCREENSHOT_RE, ScanStore, isScanId } from "./store.js";

export interface AppOptions {
  config: ServerConfig;
  /** Override the scan runner (tests). Defaults to the real browser pipeline. */
  runner?: ScanRunner;
  registry?: DetectorRegistry;
  logger?: boolean;
}

export interface WebDnaApp {
  app: FastifyInstance;
  store: ScanStore;
  queue: ScanQueue;
}

function sendError(
  reply: FastifyReply,
  status: number,
  code: string,
  message: string,
  details?: unknown,
) {
  return reply.status(status).send({ error: { code, message, ...(details ? { details } : {}) } });
}

const IdParams = z.object({ id: z.string() });

/** Compare a Host header value ("name:port", "[v6]:port") against allowed names, ignoring the port. */
export function hostAllowed(hostHeader: string, allowed: string[]): boolean {
  const h = hostHeader.toLowerCase();
  const name = h.startsWith("[") ? h.slice(0, h.indexOf("]") + 1) : h.split(":")[0]!;
  return allowed.includes(name);
}

export async function buildApp(options: AppOptions): Promise<WebDnaApp> {
  const { config } = options;
  const registry = options.registry ?? createDefaultRegistry();
  const policy = new NetworkPolicy({
    allowedPorts: config.allowedPorts,
    unsafeAllowLoopback: config.unsafeAllowLoopback,
    resolver: config.offlineDns
      ? async (host) => {
          throw new Error(`DNS disabled (WEBDNA_OFFLINE_DNS): ${host}`);
        }
      : undefined,
  });
  const store = new ScanStore(config.dataDir);
  await store.init();

  const runner: ScanRunner =
    options.runner ??
    ((record, signal, onStage, url) =>
      runScan({
        scanId: record.id,
        url,
        viewports: record.viewports,
        outputDir: store.dir(record.id),
        policy,
        registry,
        limits: config.limits,
        disabledDetectors: config.disabledDetectors,
        signal,
        onStage,
      }));
  const queue = new ScanQueue(store, runner, config.maxConcurrency, config.maxQueue);

  const app = Fastify({ logger: options.logger ?? false, bodyLimit: 16 * 1024 });

  // DNS-rebinding protection: a hostile site that re-points its own domain to 127.0.0.1
  // would send requests with its own name in Host (directly, or via the Next.js proxy in
  // X-Forwarded-Host). Only configured host names are accepted.
  app.addHook("onRequest", async (req, reply) => {
    for (const header of [req.headers.host, req.headers["x-forwarded-host"]]) {
      if (header === undefined) continue;
      const value = Array.isArray(header) ? header.join(",") : header;
      for (const entry of value.split(",")) {
        if (!hostAllowed(entry.trim(), config.allowedHosts)) {
          return sendError(reply, 403, "host_not_allowed", "Request host is not allowed.");
        }
      }
    }
  });

  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof ZodError)
      return sendError(reply, 400, "invalid_request", "Request validation failed.", error.issues);
    const status = (error as { statusCode?: number }).statusCode;
    if (status && status < 500)
      return sendError(reply, status, "bad_request", (error as Error).message);
    app.log.error(error);
    return sendError(reply, 500, "internal_error", "Internal server error.");
  });

  app.get("/api/health", async () => ({ ok: true, queue: queue.size }));

  app.post("/api/scans", async (req, reply) => {
    const body = CreateScanRequestSchema.parse(req.body);
    let url: URL;
    try {
      url = normalizeTargetUrl(body.url);
    } catch (e) {
      if (e instanceof ScanFailure) return sendError(reply, 400, e.code, e.message);
      throw e;
    }
    if (!queue.canAccept())
      return sendError(reply, 429, "queue_full", "Too many scans are waiting. Try again shortly.");
    // Persist only redacted URLs; the real one stays in memory for the worker.
    const record = await store.create(
      redactSecrets(body.url).text,
      body.viewports ?? ["desktop", "tablet", "mobile"],
      redactSecrets(url.toString()).text,
      url.hostname,
    );
    queue.enqueue(record.id, url.toString());
    return reply.status(202).send({ scan: record });
  });

  app.get("/api/scans", async (req) => {
    const { limit } = z
      .object({ limit: z.coerce.number().int().min(1).max(200).default(50) })
      .parse(req.query);
    return { scans: await store.list(limit) };
  });

  app.get("/api/scans/:id", async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    const record = isScanId(id) ? await store.get(id) : undefined;
    if (!record) return sendError(reply, 404, "not_found", "Scan not found.");
    return { scan: record };
  });

  app.get("/api/scans/:id/report", async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    const record = await store.get(id);
    if (!record) return sendError(reply, 404, "not_found", "Scan not found.");
    if (record.status !== "completed")
      return sendError(reply, 409, "not_completed", `Scan is ${record.status}.`);
    const report = await store.getReport(id);
    if (!report)
      return sendError(reply, 404, "report_missing", "Report file is missing or invalid.");
    return { report };
  });

  app.post("/api/scans/:id/cancel", async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    const record = await store.get(id);
    if (!record) return sendError(reply, 404, "not_found", "Scan not found.");
    if (!(await queue.cancel(id)))
      return sendError(reply, 409, "not_cancellable", `Scan is ${record.status}.`);
    return reply.status(202).send({ ok: true });
  });

  app.delete("/api/scans/:id", async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    if (queue.isActive(id))
      return sendError(reply, 409, "scan_active", "Cancel the scan before deleting it.");
    if (!(await store.delete(id))) return sendError(reply, 404, "not_found", "Scan not found.");
    return reply.status(204).send();
  });

  app.get("/api/scans/:id/screenshots/:name", async (req, reply) => {
    const { id, name } = z
      .object({ id: z.string(), name: z.string().regex(SCREENSHOT_RE) })
      .parse(req.params);
    const data = await store.readScreenshot(id, name);
    if (!data) return sendError(reply, 404, "not_found", "Screenshot not found.");
    return reply
      .header("content-type", "image/jpeg")
      .header("cache-control", "private, max-age=3600")
      .send(data);
  });

  app.get("/api/scans/:id/export/:format", async (req, reply) => {
    const { id, format } = z
      .object({ id: z.string(), format: z.enum(EXPORT_FORMATS) })
      .parse(req.params);
    const report = await store.getReport(id);
    if (!report) return sendError(reply, 404, "not_found", "No completed report for this scan.");
    const base = `webdna-${report.target.domain.replace(/[^a-z0-9.-]/gi, "_")}-${id.slice(0, 8)}`;
    const send = (body: string | Uint8Array, type: string, ext: string) =>
      reply
        .header("content-type", type)
        .header("content-disposition", `attachment; filename="${base}.${ext}"`)
        .send(Buffer.from(body));
    const f = format as ExportFormat;
    if (f === "json") return send(exportJson(report), "application/json; charset=utf-8", "json");
    if (f === "css")
      return send(exportCssVariables(report), "text/css; charset=utf-8", "tokens.css");
    if (f === "tailwind")
      return send(exportTailwindTheme(report), "text/css; charset=utf-8", "tailwind-theme.css");
    if (f === "markdown") return send(exportMarkdown(report), "text/markdown; charset=utf-8", "md");
    if (f === "prompt") {
      const { stack, lang } = z
        .object({
          stack: z.enum(PROMPT_STACKS).default("react-tailwind"),
          lang: z.enum(["en", "tr"]).default("en"),
        })
        .parse(req.query);
      return send(
        buildRebuildPrompt(report, { stack, language: lang }),
        "text/markdown; charset=utf-8",
        "prompt.md",
      );
    }
    const shots: Record<string, Uint8Array> = {};
    for (const v of report.viewports) {
      for (const name of [v.screenshots.viewport, v.screenshots.fullPage].filter(
        (n): n is string => !!n,
      )) {
        const data = await store.readScreenshot(id, path.basename(name));
        if (data) shots[name] = data;
      }
    }
    return send(exportEvidenceZip(report, shots), "application/zip", "evidence.zip");
  });

  app.get("/api/compare", async (req, reply) => {
    const { a, b } = z.object({ a: z.string(), b: z.string() }).parse(req.query);
    const [ra, rb] = await Promise.all([store.getReport(a), store.getReport(b)]);
    if (!ra || !rb) return sendError(reply, 404, "not_found", "Both scans must be completed.");
    return { comparison: compareReports(ra, rb) };
  });

  app.get("/api/detectors", async () => ({
    ruleSetVersion: registry.ruleSetVersion,
    disabled: config.disabledDetectors,
    detectors: registry.list().map((d) => ({
      id: d.id,
      name: d.name,
      version: d.version,
      category: d.category,
      status: config.disabledDetectors.includes(d.id) ? "disabled" : d.status,
      description: d.description,
      maxStrength: d.maxStrength,
      evidenceRequirements: d.evidenceRequirements,
      limitations: d.limitations,
      falsePositiveConsiderations: d.falsePositiveConsiderations,
      provenance: d.provenance,
    })),
  }));

  app.addHook("onClose", async () => {
    await queue.shutdown();
  });

  return { app, store, queue };
}
