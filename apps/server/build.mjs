// Bundles the server and the workspace packages into dist/index.js.
// Third-party dependencies (playwright, fastify, …) stay external and load from node_modules.
import { build } from "esbuild";
import { readFileSync } from "node:fs";

const external = new Set();
for (const pkg of [
  "./package.json",
  "../../packages/analysis-core/package.json",
  "../../packages/detectors/package.json",
  "../../packages/shared/package.json",
]) {
  const json = JSON.parse(readFileSync(new URL(pkg, import.meta.url), "utf8"));
  for (const dep of Object.keys(json.dependencies ?? {}))
    if (!dep.startsWith("@webdna/")) external.add(dep);
}

await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: true,
  external: [...external],
  logLevel: "info",
});
