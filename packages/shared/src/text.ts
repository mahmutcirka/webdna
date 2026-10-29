/** Truncate a string for storage in a report. */
export function truncate(value: string, max = 200): string {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

const SECRET_PATTERNS: RegExp[] = [
  /\bAKIA[0-9A-Z]{16}\b/g, // AWS access key id
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g, // GitHub tokens
  /\bsk-[A-Za-z0-9_-]{20,}\b/g, // common "sk-" API keys
  /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g, // Slack tokens
  /\bAIza[0-9A-Za-z_-]{35}\b/g, // Google API keys
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, // JWTs
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
  /\b[A-Fa-f0-9]{40,}\b/g, // long hex strings
];

/**
 * Replace values that look like credentials with a placeholder. Reports must never
 * re-publish secrets a site accidentally exposed. Returns the redacted text and a count.
 */
export function redactSecrets(value: string): { text: string; redacted: number } {
  let redacted = 0;
  let text = value;
  for (const pattern of SECRET_PATTERNS) {
    text = text.replace(pattern, () => {
      redacted += 1;
      return "[redacted]";
    });
  }
  // Credential-like query/fragment parameters (signed URLs, OAuth codes, session ids).
  text = text.replace(SECRET_PARAM, (_m, prefix: string) => {
    redacted += 1;
    return `${prefix}[redacted]`;
  });
  return { text, redacted };
}

const SECRET_PARAM =
  /([?&#;][\w.-]*?(?:token|secret|password|passwd|pwd|session|sess|sid|sig|signature|credential|auth|authorization|apikey|api_key|key|code|ticket)(?:_?id)?=)[^&#\s"'<>]+/gi;

/**
 * Extract block comments (`/* … *\/`) in linear time. A regex such as
 * /\/\*[\s\S]*?\*\//g is quadratic on input with many unclosed comment openers,
 * which a hostile stylesheet can exploit to stall the analysis worker.
 */
export function extractBlockComments(
  text: string,
  options: { max: number; bangOnly?: boolean; maxLength?: number },
): string[] {
  const out: string[] = [];
  let from = 0;
  while (out.length < options.max) {
    const start = text.indexOf(options.bangOnly ? "/*!" : "/*", from);
    if (start < 0) break;
    const end = text.indexOf("*/", start + 2);
    if (end < 0) break; // no terminator anywhere after this point: stop, never rescan
    const body = text.slice(start + (options.bangOnly ? 3 : 2), end);
    if (!options.maxLength || body.length <= options.maxLength) out.push(body);
    from = end + 2;
  }
  return out;
}

/** Truncate and redact in one step. */
export function safeSnippet(value: string, max = 200): string {
  return truncate(redactSecrets(value).text, max);
}
