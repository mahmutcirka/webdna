import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  ReportSchema,
  ScanRecordSchema,
  STAGES,
  type Report,
  type ScanRecord,
  type ViewportId,
} from "@webdna/shared";

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const SCREENSHOT_RE = /^(desktop|tablet|mobile)-(viewport|full)\.jpg$/;

export function isScanId(id: string): boolean {
  return ID_RE.test(id);
}

/**
 * File-based storage: one directory per scan holding scan.json (status), report.json
 * and screenshots. Reports are self-contained files, so no database is needed.
 * Writes go to a temp file first and are renamed into place.
 */
export class ScanStore {
  private readonly root: string;
  private readonly cache = new Map<string, ScanRecord>();

  constructor(dataDir: string) {
    this.root = path.join(dataDir, "scans");
  }

  async init(): Promise<void> {
    await mkdir(this.root, { recursive: true });
  }

  dir(id: string): string {
    if (!isScanId(id)) throw new Error("invalid scan id");
    return path.join(this.root, id);
  }

  async create(
    inputUrl: string,
    viewports: ViewportId[],
    normalizedUrl: string,
    domain: string,
  ): Promise<ScanRecord> {
    const id = randomUUID();
    const record: ScanRecord = {
      id,
      inputUrl,
      normalizedUrl,
      domain,
      status: "queued",
      createdAt: new Date().toISOString(),
      viewports,
      stages: STAGES.map((s) => ({ id: s.id, state: "pending" as const })),
      warnings: [],
      reportAvailable: false,
    };
    await mkdir(this.dir(id), { recursive: true });
    await this.save(record);
    return record;
  }

  async save(record: ScanRecord): Promise<void> {
    ScanRecordSchema.parse(record);
    this.cache.set(record.id, record);
    await atomicWrite(path.join(this.dir(record.id), "scan.json"), JSON.stringify(record, null, 2));
  }

  async update(id: string, mutate: (r: ScanRecord) => void): Promise<ScanRecord | undefined> {
    const record = await this.get(id);
    if (!record) return undefined;
    mutate(record);
    await this.save(record);
    return record;
  }

  async get(id: string): Promise<ScanRecord | undefined> {
    if (!isScanId(id)) return undefined;
    const cached = this.cache.get(id);
    if (cached) return cached;
    try {
      const record = ScanRecordSchema.parse(
        JSON.parse(await readFile(path.join(this.dir(id), "scan.json"), "utf8")),
      );
      this.cache.set(id, record);
      return record;
    } catch {
      return undefined;
    }
  }

  async list(limit = 50): Promise<ScanRecord[]> {
    let entries: string[];
    try {
      entries = (await readdir(this.root)).filter(isScanId);
    } catch {
      return [];
    }
    const records = (await Promise.all(entries.map((id) => this.get(id)))).filter(
      (r): r is ScanRecord => !!r,
    );
    return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
  }

  async saveReport(report: Report): Promise<void> {
    await atomicWrite(path.join(this.dir(report.scanId), "report.json"), JSON.stringify(report));
  }

  async getReport(id: string): Promise<Report | undefined> {
    if (!isScanId(id)) return undefined;
    try {
      return ReportSchema.parse(
        JSON.parse(await readFile(path.join(this.dir(id), "report.json"), "utf8")),
      );
    } catch {
      return undefined;
    }
  }

  async readScreenshot(id: string, name: string): Promise<Buffer | undefined> {
    if (!isScanId(id) || !SCREENSHOT_RE.test(name)) return undefined;
    try {
      return await readFile(path.join(this.dir(id), name));
    } catch {
      return undefined;
    }
  }

  async delete(id: string): Promise<boolean> {
    if (!isScanId(id)) return false;
    this.cache.delete(id);
    try {
      await stat(this.dir(id));
    } catch {
      return false;
    }
    await rm(this.dir(id), { recursive: true, force: true });
    return true;
  }

  /** Remove scans older than the retention window. Returns the number removed. */
  async applyRetention(days: number, isActive: (id: string) => boolean): Promise<number> {
    if (days <= 0) return 0;
    const cutoff = Date.now() - days * 86_400_000;
    let removed = 0;
    for (const record of await this.list(10_000)) {
      if (!isActive(record.id) && Date.parse(record.createdAt) < cutoff) {
        await this.delete(record.id);
        removed += 1;
      }
    }
    return removed;
  }

  /** Scans left queued/running by a previous process cannot resume; mark them failed. */
  async markInterrupted(): Promise<number> {
    let n = 0;
    for (const record of await this.list(10_000)) {
      if (record.status === "queued" || record.status === "running") {
        await this.update(record.id, (r) => {
          r.status = "failed";
          r.finishedAt = new Date().toISOString();
          r.error = {
            code: "interrupted",
            message: "The server restarted before this scan finished.",
          };
          for (const s of r.stages)
            if (s.state === "pending" || s.state === "running") s.state = "skipped";
        });
        n += 1;
      }
    }
    return n;
  }
}

async function atomicWrite(file: string, data: string): Promise<void> {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, data, "utf8");
  await rename(tmp, file);
}
