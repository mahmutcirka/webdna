import {
  Boxes,
  Code2,
  FileDown,
  Fingerprint,
  LayoutGrid,
  MonitorSmartphone,
  Palette,
  ShieldCheck,
  Type,
} from "lucide-react";
import Link from "next/link";
import type { Report } from "@webdna/shared";
import { AI_CONCLUSION_LABELS } from "@webdna/shared";
import { UrlForm } from "@/components/url-form";
import { Badge, Card, Callout } from "@/components/ui";
import sample from "@/sample/sample-report.json";

const report = sample as unknown as Report;

const FEATURES = [
  {
    icon: Palette,
    title: "Design-system extraction",
    text: "Colours, type styles, spacing, radii and shadows measured from computed CSS, with the elements they came from.",
  },
  {
    icon: Type,
    title: "Typography",
    text: "Font families, sizes, weights and line heights grouped by real usage across viewports.",
  },
  {
    icon: Boxes,
    title: "Component patterns",
    text: "Buttons, cards, inputs, navigation and repeated sections detected heuristically from DOM and CSS.",
  },
  {
    icon: MonitorSmartphone,
    title: "Responsive comparison",
    text: "Desktop, tablet and mobile renders compared for column, direction, visibility and overflow changes.",
  },
  {
    icon: Code2,
    title: "Source analysis",
    text: "Public HTML, CSS and JavaScript parsed as data: frameworks, build tools, breakpoints, naming conventions.",
  },
  {
    icon: Fingerprint,
    title: "AI-origin evidence",
    text: "Versioned detector rules that separate platform identification, AI-related signals and template reuse.",
  },
  {
    icon: LayoutGrid,
    title: "History & comparison",
    text: "Compare two scans, with detector-version changes called out separately from site changes.",
  },
  {
    icon: FileDown,
    title: "Exports",
    text: "JSON report, CSS variables, a Tailwind v4 theme, Markdown, and an evidence bundle with screenshots.",
  },
];

export default function Home() {
  const colors = report.design.colors.slice(0, 8);
  return (
    <div className="space-y-16">
      <section className="grid gap-10 pt-6 lg:grid-cols-[1.2fr_1fr] lg:items-center">
        <div>
          <Badge tone="outline">Open source · runs locally</Badge>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-text sm:text-5xl">
            Inspect how a website is built — and what the evidence can and cannot say.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted">
            WebDNA opens a public page in an isolated browser, measures its rendered design system,
            compares its responsive layouts, analyses its public frontend source files, and reports
            evidence about website platforms and possible AI-assisted generation — with explicit
            strength, alternatives and limitations for every finding.
          </p>
          <div className="mt-8 max-w-2xl">
            <UrlForm autoFocus />
            <p className="mt-3 text-xs text-faint">
              Only public http(s) pages. Private, loopback, link-local and cloud-metadata
              destinations are blocked on every connection.
            </p>
          </div>
        </div>
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="text-sm font-medium text-text">Sample report</span>
            <Badge tone="warn">Example data</Badge>
          </div>
          <div className="space-y-4 p-4">
            <p className="text-xs text-muted">{report.sample?.label}</p>
            <div className="grid grid-cols-8 gap-1.5">
              {colors.map((c) => (
                <div
                  key={c.hex}
                  className="aspect-square rounded border border-border"
                  style={{ background: c.hex }}
                  title={c.hex}
                />
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded border border-border p-2">
                <div className="text-lg font-semibold text-text">{report.components.length}</div>
                <div className="text-muted">patterns</div>
              </div>
              <div className="rounded border border-border p-2">
                <div className="text-lg font-semibold text-text">
                  {report.responsive.changes.length}
                </div>
                <div className="text-muted">responsive changes</div>
              </div>
              <div className="rounded border border-border p-2">
                <div className="text-lg font-semibold text-text">
                  {report.accessibility.issues.length}
                </div>
                <div className="text-muted">a11y observations</div>
              </div>
            </div>
            <div className="rounded border border-border px-3 py-2 text-sm">
              <span className="text-muted">AI-origin: </span>
              <span className="text-text">{report.aiOrigin.conclusionLabel}</span>
            </div>
            <Link
              href="/sample"
              className="inline-flex text-sm font-medium text-accent hover:underline"
            >
              Open the full sample report →
            </Link>
          </div>
        </Card>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-text">What WebDNA analyses</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <Card key={f.title} className="p-4">
              <f.icon size={18} className="text-accent" />
              <h3 className="mt-3 text-sm font-semibold text-text">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{f.text}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-text">
            <ShieldCheck size={18} className="text-accent" /> How AI-origin analysis works
          </h2>
          <ol className="mt-4 space-y-3 text-sm leading-relaxed text-muted">
            <li>
              <span className="font-medium text-text">A. Platform identification.</span> Generator
              tags, asset paths, headers and runtime markers identify CMSs, frameworks, builders and
              hosting. A framework is never treated as evidence of AI.
            </li>
            <li>
              <span className="font-medium text-text">B. AI-related signals.</span> Explicit markers
              of AI builders or self-declared generator comments. Each finding records whether it is
              direct or inferred, its strength and its alternative explanations.
            </li>
            <li>
              <span className="font-medium text-text">C. Template signals.</span> Unchanged starter
              content, placeholders and unreplaced variables — reported separately because reuse is
              not AI involvement.
            </li>
          </ol>
          <p className="mt-4 text-sm text-muted">
            Every report names the detector versions that produced it.
          </p>
        </Card>
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-text">Limitations, stated plainly</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted">
            <li>
              A site&apos;s origin generally cannot be established from its appearance. Visual
              polish, generic layouts, stock imagery or popular frameworks are not evidence.
            </li>
            <li>
              Markers can be removed, copied or left behind after heavy manual editing. Their
              absence proves nothing.
            </li>
            <li>
              The five result categories are evidence categories, not calibrated probabilities.
              WebDNA never reports “% AI-generated”.
            </li>
            <li>
              WebDNA never identifies a model (Claude, GPT, Gemini…) unless the page explicitly says
              so — and then it only quotes the claim.
            </li>
            <li>
              Detector behaviour has only been checked against synthetic test fixtures; no
              real-world accuracy is claimed.
            </li>
          </ul>
          <div className="mt-4">
            <Callout>
              Possible results:{" "}
              {Object.values(AI_CONCLUSION_LABELS).map((l, i) => (
                <span key={l}>
                  {i > 0 && " · "}
                  <span className="text-text">{l}</span>
                </span>
              ))}
            </Callout>
          </div>
        </Card>
      </section>
    </div>
  );
}
