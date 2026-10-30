import type { ComponentProps, ReactNode } from "react";
import type { AiConclusion, EvidenceStrength, ScanStatus } from "@webdna/shared";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cx("min-w-0 rounded-lg border border-border bg-surface", className)}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-text">{title}</h3>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

type Tone = "neutral" | "accent" | "info" | "warn" | "danger" | "outline";
const TONES: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted border-border",
  accent: "bg-accent-soft text-accent border-transparent",
  info: "bg-info-soft text-info border-transparent",
  warn: "bg-warn-soft text-warn border-transparent",
  danger: "bg-danger-soft text-danger border-transparent",
  outline: "bg-transparent text-muted border-border-strong",
};

export function Badge({
  tone = "neutral",
  children,
  className,
  title,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cx(
        "inline-flex items-center gap-1 whitespace-nowrap rounded border px-1.5 py-0.5 text-xs font-medium",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StrengthBadge({
  strength,
  label,
  title,
}: {
  strength: EvidenceStrength;
  /** Localised strength name. */
  label: string;
  title: string;
}) {
  const tone: Tone =
    strength === "strong"
      ? "accent"
      : strength === "moderate"
        ? "info"
        : strength === "weak"
          ? "neutral"
          : "outline";
  return (
    <Badge tone={tone} title={title}>
      {label}
    </Badge>
  );
}

export function StatusBadge({ status, label }: { status: ScanStatus; label: string }) {
  const tone: Tone =
    status === "completed"
      ? "accent"
      : status === "failed"
        ? "danger"
        : status === "running"
          ? "info"
          : "neutral";
  return <Badge tone={tone}>{label}</Badge>;
}

/** Neutral styling on purpose: an AI-related finding is information, not an accusation. */
export function conclusionTone(c: AiConclusion): Tone {
  if (c === "strong_ai_evidence") return "info";
  if (c === "some_ai_indicators") return "info";
  if (c === "insufficient_evidence") return "warn";
  return "neutral";
}

export function Button({
  variant = "primary",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  const styles = {
    primary: "bg-accent text-accent-ink hover:opacity-90",
    secondary: "border border-border-strong bg-surface-2 text-text hover:bg-surface",
    ghost: "text-muted hover:text-text hover:bg-surface-2",
    danger: "border border-border-strong text-danger hover:bg-danger-soft",
  }[variant];
  return (
    <button
      className={cx(
        "inline-flex h-9 items-center justify-center gap-2 rounded-md px-3.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        styles,
        className,
      )}
      {...props}
    />
  );
}

export function LinkButton({
  variant = "secondary",
  className,
  ...props
}: ComponentProps<"a"> & { variant?: "primary" | "secondary" }) {
  const styles =
    variant === "primary"
      ? "bg-accent text-accent-ink hover:opacity-90"
      : "border border-border-strong bg-surface-2 text-text hover:bg-surface";
  return (
    <a
      className={cx(
        "inline-flex h-9 items-center justify-center gap-2 rounded-md px-3.5 text-sm font-medium transition",
        styles,
        className,
      )}
      {...props}
    />
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-surface px-4 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div
        className="mt-1 truncate text-lg font-semibold tabular-nums text-text"
        title={typeof value === "string" ? value : undefined}
      >
        {value}
      </div>
      {hint && <div className="mt-0.5 text-xs text-faint">{hint}</div>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
      {children}
    </div>
  );
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <code
      className={cx(
        "break-all rounded bg-surface-2 px-1 py-0.5 font-mono text-[12px] text-text",
        className,
      )}
    >
      {children}
    </code>
  );
}

export function Callout({
  tone = "neutral",
  icon,
  children,
}: {
  tone?: "neutral" | "warn" | "info";
  icon?: ReactNode;
  children: ReactNode;
}) {
  const styles = {
    neutral: "border-border bg-surface-2 text-muted",
    warn: "border-transparent bg-warn-soft text-warn",
    info: "border-transparent bg-info-soft text-info",
  }[tone];
  return (
    <div className={cx("flex gap-3 rounded-md border px-4 py-3 text-sm", styles)}>
      {icon && <div className="mt-0.5 shrink-0">{icon}</div>}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted">
            {head.map((h, i) => (
              <th key={i} className="px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cx("px-3 py-2 align-top text-text", className)}>{children}</td>;
}
