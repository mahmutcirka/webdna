import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  bundleFromHtml,
  createDefaultRegistry,
  concludeAiOrigin,
  type EvidenceBundle,
} from "../src/index.js";

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
export const registry = createDefaultRegistry();

export interface FixtureOptions {
  url?: string;
  headers?: Record<string, string>;
}

/**
 * Build a static evidence bundle from a fixture directory. Local scripts and
 * stylesheets referenced by the HTML are loaded from the fixture folder, mirroring
 * what the browser would capture.
 */
export function fixtureBundle(name: string, options: FixtureOptions = {}): EvidenceBundle {
  const dir = path.join(REPO_ROOT, "fixtures", "sites", name);
  const html = readFileSync(path.join(dir, "index.html"), "utf8");
  const url = options.url ?? "https://fixture.example/";
  const origin = new URL(url).origin;
  const bundle = bundleFromHtml(html, {
    url,
    headers: options.headers,
    selectors: registry.requiredSelectors(),
  });
  const load = (u: string) => {
    if (!u.startsWith(origin)) return undefined;
    const file = path.join(dir, decodeURIComponent(new URL(u).pathname));
    return existsSync(file) ? readFileSync(file, "utf8") : undefined;
  };
  for (const s of bundle.scripts) {
    const text = s.src ? load(s.src) : undefined;
    if (text && s.src)
      bundle.scriptSources.push({
        url: s.src,
        text,
        comments: [...text.matchAll(/\/\*([\s\S]*?)\*\//g)].map((m) => m[1]!.trim()),
      });
  }
  for (const href of bundle.stylesheets) {
    const text = load(href);
    if (text)
      bundle.stylesheetSources.push({
        url: href,
        text,
        comments: [...text.matchAll(/\/\*([\s\S]*?)\*\//g)].map((m) => m[1]!.trim()),
      });
  }
  bundle.coverage.scriptsInspected = bundle.scriptSources.length;
  bundle.coverage.stylesheetsInspected = bundle.stylesheetSources.length;
  return bundle;
}

export function analyze(bundle: EvidenceBundle, disabled: string[] = []) {
  const { findings, runs } = registry.run(bundle, { disabled });
  return concludeAiOrigin(findings, bundle.coverage, runs, registry.ruleSetVersion);
}

export function analyzeFixture(name: string, options: FixtureOptions = {}) {
  return analyze(fixtureBundle(name, options));
}
