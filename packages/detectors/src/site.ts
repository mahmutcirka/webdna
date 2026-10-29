/**
 * Approximate "same site" check: equal hostnames, or equal last two labels. This is not
 * the Public Suffix List (e.g. a.github.io and b.github.io count as the same site), which
 * is documented as a limitation. IP literals must match exactly.
 */
export function baseDomain(host: string): string {
  const h = host.toLowerCase().replace(/\.$/, "");
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(":")) return h;
  return h.split(".").slice(-2).join(".");
}

/** True when `url` (absolute) belongs to the same site as `siteHost`. Non-URLs count as first-party. */
export function isSameSite(url: string, siteHost: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return true; // e.g. "inline <script> #1"
  }
  return host === siteHost || baseDomain(host) === baseDomain(siteHost);
}

export function hostOf(url: string): string | undefined {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}
