import http from "node:http";
import https from "node:https";
import type { LookupFunction } from "node:net";
import { ScanFailure } from "../errors.js";
import type { NetworkPolicy } from "./policy.js";
import { effectivePort } from "./url.js";

export interface SafeFetchOptions {
  maxBytes: number;
  timeoutMs: number;
  maxRedirects?: number;
  signal?: AbortSignal;
}

export interface SafeFetchResult {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
  truncated: boolean;
  finalUrl: string;
}

/**
 * Fetch a public resource as data. Every hop is validated by the NetworkPolicy and the
 * socket is pinned to the validated address (custom `lookup`), so DNS cannot change
 * between validation and connection. Redirects are followed manually and re-validated.
 */
export async function safeFetch(
  urlInput: string,
  policy: NetworkPolicy,
  options: SafeFetchOptions,
): Promise<SafeFetchResult> {
  let url = new URL(urlInput);
  const maxRedirects = options.maxRedirects ?? 3;
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new ScanFailure("blocked_destination", `Unsupported protocol ${url.protocol}`);
    }
    const destination = await policy.validate(url.hostname, effectivePort(url));
    const result = await requestOnce(url, destination.address, destination.family, options);
    if (result.status >= 300 && result.status < 400 && result.headers.location) {
      url = new URL(result.headers.location, url);
      continue;
    }
    return { ...result, finalUrl: url.toString() };
  }
  throw new ScanFailure("resource_limit", "Too many redirects.");
}

function requestOnce(
  url: URL,
  address: string,
  family: 4 | 6,
  options: SafeFetchOptions,
): Promise<Omit<SafeFetchResult, "finalUrl">> {
  const pinnedLookup: LookupFunction = (_hostname, opts, callback) => {
    if ((opts as { all?: boolean }).all) {
      (callback as unknown as (e: null, a: { address: string; family: number }[]) => void)(null, [
        { address, family },
      ]);
    } else {
      callback(null, address, family);
    }
  };
  const client = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = client.request(
      url,
      {
        method: "GET",
        lookup: pinnedLookup,
        timeout: options.timeoutMs,
        signal: options.signal,
        headers: { "user-agent": "WebDNA/0.1 (open-source website analysis)", accept: "*/*" },
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        let truncated = false;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > options.maxBytes) {
            truncated = true;
            chunks.push(chunk.subarray(0, chunk.length - (size - options.maxBytes)));
            res.destroy();
            return;
          }
          chunks.push(chunk);
        });
        const finish = () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: Object.fromEntries(
              Object.entries(res.headers).map(([k, v]) => [
                k,
                Array.isArray(v) ? v.join(", ") : (v ?? ""),
              ]),
            ),
            body: Buffer.concat(chunks),
            truncated,
          });
        res.on("end", finish);
        res.on("close", finish);
        res.on("error", (e) => (truncated ? finish() : reject(e)));
      },
    );
    req.on("timeout", () =>
      req.destroy(new ScanFailure("navigation_timeout", "Request timed out.")),
    );
    req.on("error", reject);
    req.end();
  });
}
