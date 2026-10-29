import { ScanFailure } from "../errors.js";
import { isIpLiteral } from "./ip.js";

const BLOCKED_HOST_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".intranet",
  ".lan",
  ".home.arpa",
  ".corp",
];
const BLOCKED_HOSTS = new Set(["localhost", "metadata", "metadata.google.internal"]);

/**
 * Normalise user input into an absolute http(s) URL, or throw ScanFailure("invalid_url").
 * DNS/IP checks happen separately (see NetworkPolicy) because they must be repeated
 * for every redirect and connection.
 */
export function normalizeTargetUrl(input: string): URL {
  let raw = input.trim();
  if (raw.length === 0) throw new ScanFailure("invalid_url", "Enter a URL to analyze.");
  if (raw.length > 2048)
    throw new ScanFailure("invalid_url", "URL is too long (max 2048 characters).");
  if (/[\u0000-\u001f\u007f\s]/.test(raw))
    throw new ScanFailure("invalid_url", "URL contains whitespace or control characters.");
  if (!/^[a-z][a-z0-9+.-]*:/i.test(raw)) raw = `https://${raw}`;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ScanFailure("invalid_url", "This is not a valid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ScanFailure("invalid_url", "Only http:// and https:// URLs can be analyzed.");
  }
  if (url.username || url.password) {
    throw new ScanFailure("invalid_url", "URLs containing credentials are not accepted.");
  }
  const host = url.hostname.toLowerCase();
  if (!host) throw new ScanFailure("invalid_url", "URL has no host.");
  if (!isIpLiteral(host)) {
    if (BLOCKED_HOSTS.has(host) || BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) {
      throw new ScanFailure(
        "blocked_destination",
        `Host "${host}" refers to a local or internal network name.`,
      );
    }
    if (!host.includes(".")) {
      throw new ScanFailure("invalid_url", `Host "${host}" is not a fully-qualified domain name.`);
    }
  }
  url.hash = "";
  return url;
}

export function effectivePort(url: URL): number {
  if (url.port) return Number(url.port);
  return url.protocol === "https:" ? 443 : 80;
}
