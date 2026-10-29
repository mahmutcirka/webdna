import path from "node:path";
import { z } from "zod";

const csv = (value: string | undefined) =>
  (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const EnvSchema = z.object({
  WEBDNA_HOST: z.string().default("127.0.0.1"),
  WEBDNA_PORT: z.coerce.number().int().min(1).max(65535).default(4100),
  WEBDNA_DATA_DIR: z.string().default("./data"),
  WEBDNA_MAX_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(2),
  WEBDNA_MAX_QUEUE: z.coerce.number().int().min(1).max(500).default(20),
  WEBDNA_RETENTION_DAYS: z.coerce.number().min(0).default(14),
  WEBDNA_NAV_TIMEOUT_MS: z.coerce.number().int().min(1000).default(30_000),
  WEBDNA_SCAN_TIMEOUT_MS: z.coerce.number().int().min(5000).default(180_000),
  WEBDNA_MAX_TOTAL_BYTES: z.coerce
    .number()
    .int()
    .min(100_000)
    .default(64 * 1024 * 1024),
  WEBDNA_MAX_REQUESTS: z.coerce.number().int().min(10).default(600),
  WEBDNA_ALLOWED_PORTS: z.string().default("80,443,8080,8443"),
  WEBDNA_UNSAFE_ALLOW_LOOPBACK: z.string().optional(),
  WEBDNA_DISABLED_DETECTORS: z.string().optional(),
  WEBDNA_OFFLINE_DNS: z.enum(["0", "1", "true", "false"]).optional(),
  WEBDNA_ALLOWED_HOSTS: z.string().default("localhost,127.0.0.1,[::1]"),
});

export interface ServerConfig {
  host: string;
  port: number;
  dataDir: string;
  maxConcurrency: number;
  maxQueue: number;
  retentionDays: number;
  limits: {
    navTimeoutMs: number;
    scanTimeoutMs: number;
    maxTotalBytes: number;
    maxRequests: number;
  };
  allowedPorts: number[];
  unsafeAllowLoopback: string[];
  disabledDetectors: string[];
  /** Fail every DNS lookup (tests / air-gapped use). Only IP literals and allow-listed loopback work. */
  offlineDns: boolean;
  /** Host names (any port) accepted in Host / X-Forwarded-Host. Blocks DNS-rebinding access. */
  allowedHosts: string[];
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const e = EnvSchema.parse(env);
  // The repository root is two levels above apps/server; relative data dirs resolve from there.
  const repoRoot = path.resolve(import.meta.dirname, "../../..");
  return {
    host: e.WEBDNA_HOST,
    port: e.WEBDNA_PORT,
    dataDir: path.isAbsolute(e.WEBDNA_DATA_DIR)
      ? e.WEBDNA_DATA_DIR
      : path.resolve(repoRoot, e.WEBDNA_DATA_DIR),
    maxConcurrency: e.WEBDNA_MAX_CONCURRENCY,
    maxQueue: e.WEBDNA_MAX_QUEUE,
    retentionDays: e.WEBDNA_RETENTION_DAYS,
    limits: {
      navTimeoutMs: e.WEBDNA_NAV_TIMEOUT_MS,
      scanTimeoutMs: e.WEBDNA_SCAN_TIMEOUT_MS,
      maxTotalBytes: e.WEBDNA_MAX_TOTAL_BYTES,
      maxRequests: e.WEBDNA_MAX_REQUESTS,
    },
    allowedPorts: csv(e.WEBDNA_ALLOWED_PORTS)
      .map(Number)
      .filter((n) => Number.isInteger(n) && n > 0),
    unsafeAllowLoopback: csv(e.WEBDNA_UNSAFE_ALLOW_LOOPBACK),
    disabledDetectors: csv(e.WEBDNA_DISABLED_DETECTORS),
    offlineDns: e.WEBDNA_OFFLINE_DNS === "1" || e.WEBDNA_OFFLINE_DNS === "true",
    allowedHosts: csv(e.WEBDNA_ALLOWED_HOSTS).map((h) => h.toLowerCase()),
  };
}
