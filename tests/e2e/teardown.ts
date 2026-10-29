import { rmSync } from "node:fs";

/** Remove the temporary scan data created by the E2E run (it lives under the OS temp dir). */
export default function teardown(): void {
  const dir = process.env.WEBDNA_E2E_DATA_DIR;
  if (dir && /webdna-e2e-\d+$/.test(dir)) rmSync(dir, { recursive: true, force: true });
}
