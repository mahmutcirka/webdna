"use client";

import type { Report } from "@webdna/shared";
import { ReportWorkspace } from "@/components/report/workspace";
import sample from "@/sample/sample-report.json";

// Bundled example report generated from a synthetic local fixture (see scripts/generate-sample-report.ts).
export default function SamplePage() {
  return (
    <ReportWorkspace
      report={sample as unknown as Report}
      screenshot={(name) => `/sample/${name.replace("-full", "-viewport")}`}
      fullPage={false}
    />
  );
}
