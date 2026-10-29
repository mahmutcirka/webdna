import { redactSecrets, type Report, type ScanRecord, type StageId } from "@webdna/shared";
import { ScanFailure, type StageListener } from "@webdna/analysis-core";
import type { ScanStore } from "./store.js";

export type ScanRunner = (
  record: ScanRecord,
  signal: AbortSignal,
  onStage: StageListener,
  /** The real target URL; stored records only hold a redacted copy. */
  url: string,
) => Promise<Report>;

interface Job {
  id: string;
  url: string;
  controller: AbortController;
}

/**
 * Bounded in-process job queue. Runs at most `concurrency` scans at once and rejects
 * new work when `maxQueue` jobs are waiting. Kept in-process deliberately: a single
 * WebDNA instance does not need Redis/BullMQ, and the store makes state durable.
 */
export class ScanQueue {
  private readonly waiting: Job[] = [];
  private readonly running = new Map<string, Job>();
  private chain: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly store: ScanStore,
    private readonly runner: ScanRunner,
    private readonly concurrency: number,
    private readonly maxQueue: number,
  ) {}

  get size(): { waiting: number; running: number } {
    return { waiting: this.waiting.length, running: this.running.size };
  }

  isActive(id: string): boolean {
    return this.running.has(id) || this.waiting.some((j) => j.id === id);
  }

  canAccept(): boolean {
    return this.waiting.length < this.maxQueue;
  }

  enqueue(id: string, url: string): void {
    this.waiting.push({ id, url, controller: new AbortController() });
    this.pump();
  }

  /** Cancel a queued or running scan. Returns false if it is not active. */
  async cancel(id: string): Promise<boolean> {
    const index = this.waiting.findIndex((j) => j.id === id);
    if (index >= 0) {
      this.waiting.splice(index, 1);
      await this.finish(id, "cancelled", {
        code: "cancelled",
        message: "Cancelled before it started.",
      });
      return true;
    }
    const job = this.running.get(id);
    if (job) {
      job.controller.abort();
      return true;
    }
    return false;
  }

  /** Wait for all running and queued work (used by tests and graceful shutdown). */
  async drain(): Promise<void> {
    while (this.running.size > 0 || this.waiting.length > 0) {
      await new Promise((r) => setTimeout(r, 50));
    }
    await this.chain;
  }

  async shutdown(): Promise<void> {
    for (const job of this.running.values()) job.controller.abort();
    this.waiting.length = 0;
    await this.drain();
  }

  private pump(): void {
    while (this.running.size < this.concurrency && this.waiting.length > 0) {
      const job = this.waiting.shift()!;
      this.running.set(job.id, job);
      void this.execute(job).finally(() => {
        this.running.delete(job.id);
        this.pump();
      });
    }
  }

  /** Serialise record writes so stage updates never race each other. */
  private write(id: string, mutate: (r: ScanRecord) => void): Promise<unknown> {
    this.chain = this.chain.then(() => this.store.update(id, mutate)).catch(() => undefined);
    return this.chain;
  }

  private async execute(job: Job): Promise<void> {
    const record = await this.store.get(job.id);
    if (!record) return;
    await this.write(job.id, (r) => {
      r.status = "running";
      r.startedAt = new Date().toISOString();
    });
    const onStage: StageListener = (stage: StageId, state, message) => {
      void this.write(job.id, (r) => {
        const s = r.stages.find((x) => x.id === stage);
        if (!s) return;
        s.state = state;
        if (state === "running") s.startedAt = new Date().toISOString();
        else s.finishedAt = new Date().toISOString();
        if (message) s.message = message.slice(0, 500);
      });
    };
    try {
      const report = await this.runner(record, job.controller.signal, onStage, job.url);
      await this.store.saveReport(report);
      await this.write(job.id, (r) => {
        r.status = "completed";
        r.finishedAt = new Date().toISOString();
        r.finalUrl = report.target.finalUrl;
        r.domain = report.target.domain;
        r.reportAvailable = true;
        r.warnings = report.warnings.map((w) => w.message).slice(0, 20);
        r.summary = {
          title: report.metadata.title,
          aiConclusion: report.aiOrigin.conclusion,
          platforms: report.aiOrigin.platformIdentification.platforms
            .filter((p) => p.strength === "strong" || p.strength === "moderate")
            .map((p) => p.name)
            .slice(0, 8),
          ruleSetVersion: report.aiOrigin.ruleSetVersion,
        };
      });
    } catch (error) {
      const failure =
        error instanceof ScanFailure
          ? error
          : new ScanFailure("internal_error", "Unexpected error during the scan.");
      if (!(error instanceof ScanFailure))
        console.error(
          `[webdna] scan ${job.id} crashed: ${redactSecrets(String(error instanceof Error ? (error.stack ?? error.message) : error)).text}`,
        );
      await this.finish(job.id, failure.code === "cancelled" ? "cancelled" : "failed", {
        code: failure.code,
        message: redactSecrets(failure.message).text,
      });
    }
  }

  private async finish(
    id: string,
    status: "failed" | "cancelled",
    error: ScanRecord["error"],
  ): Promise<void> {
    await this.write(id, (r) => {
      r.status = status;
      r.finishedAt = new Date().toISOString();
      r.error = error;
      for (const s of r.stages)
        if (s.state === "pending" || s.state === "running")
          s.state = s.state === "running" ? "failed" : "skipped";
    });
  }
}
