import type { ReportComparison, Report, ScanRecord, ViewportId } from "@webdna/shared";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { "content-type": "application/json", ...init?.headers },
      cache: "no-store",
    });
  } catch {
    throw new ApiError(
      0,
      "network",
      "The WebDNA server is not reachable. Is `npm run dev` running?",
    );
  }
  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => ({}))) as {
    error?: { code: string; message: string };
  };
  if (!res.ok) {
    if (res.status >= 500 && !body.error)
      throw new ApiError(
        res.status,
        "server_unreachable",
        "The WebDNA API server did not respond. Start it with `npm run dev`.",
      );
    throw new ApiError(
      res.status,
      body.error?.code ?? "error",
      body.error?.message ?? `Request failed (${res.status})`,
    );
  }
  return body as T;
}

export const api = {
  createScan: (url: string, viewports?: ViewportId[]) =>
    request<{ scan: ScanRecord }>("/api/scans", {
      method: "POST",
      body: JSON.stringify({ url, viewports }),
    }),
  listScans: (limit = 50) => request<{ scans: ScanRecord[] }>(`/api/scans?limit=${limit}`),
  getScan: (id: string) => request<{ scan: ScanRecord }>(`/api/scans/${encodeURIComponent(id)}`),
  getReport: (id: string) =>
    request<{ report: Report }>(`/api/scans/${encodeURIComponent(id)}/report`),
  cancelScan: (id: string) =>
    request<{ ok: boolean }>(`/api/scans/${encodeURIComponent(id)}/cancel`, {
      method: "POST",
      body: "{}",
    }),
  deleteScan: (id: string) =>
    request<void>(`/api/scans/${encodeURIComponent(id)}`, { method: "DELETE" }),
  compare: (a: string, b: string) =>
    request<{ comparison: ReportComparison }>(
      `/api/compare?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`,
    ),
  detectors: () => request<{ ruleSetVersion: string; detectors: DetectorInfo[] }>("/api/detectors"),
};

export interface DetectorInfo {
  id: string;
  name: string;
  version: string;
  category: string;
  status: string;
  description: string;
  maxStrength: string;
  evidenceRequirements: string[];
  limitations: string[];
  falsePositiveConsiderations: string[];
  provenance: { type: string; reference?: string; lastReviewed: string };
}

export const exportUrl = (id: string, format: string) =>
  `/api/scans/${encodeURIComponent(id)}/export/${format}`;
export const screenshotUrl = (id: string, name: string) =>
  `/api/scans/${encodeURIComponent(id)}/screenshots/${name}`;

export function formatDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
