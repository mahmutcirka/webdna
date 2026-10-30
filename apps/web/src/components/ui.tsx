import type { ComponentProps, ReactNode } from "react";
import type { AiConclusion, EvidenceStrength, ScanStatus } from "@webdna/shared";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cx("min-w-0 rounded-[3px] border border-border bg-surface", className)}
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
        <h3 className="flex items-baseline gap-2 text-[15px] font-semibold tracking-tight text-text">
          <span
            aria-hidden="true"
            className="inline-block size-1.5 shrink-0 translate-y-[-2px] bg-accent"
          />
          <span className="min-w-0">{title}</span>
        </h3>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

type Tone = "neutral" | "accent" | "info" | "warn" | "danger" | "outline";
const TONES: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted border-border",
  accent: "bg-mark text-mark-ink border-transparent",
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
        "inline-flex max-w-full items-center gap-1 rounded-[2px] border px-1.5 py-px font-mono text-[11px] font-medium uppercase tracking-wide",
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
    primary: "bg-text text-bg hover:bg-accent hover:text-accent-ink",
    secondary: "border border-border-strong bg-transparent text-text hover:bg-surface-2",
    ghost: "text-muted hover:text-text hover:bg-surface-2",
    danger: "border border-border-strong text-danger hover:bg-danger-soft",
  }[variant];
  return (
    <button
      className={cx(
        "inline-flex h-9 items-center justify-center gap-2 rounded-[3px] px-3.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
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
      ? "bg-text text-bg hover:bg-accent hover:text-accent-ink"
      : "border border-border-strong bg-transparent text-text hover:bg-surface-2";
  return (
    <a
      className={cx(
        "inline-flex h-9 items-center justify-center gap-2 rounded-[3px] px-3.5 text-sm font-medium transition-colors",
        styles,
        className,
      )}
      {...props}
    />
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="min-w-0 rounded-[3px] border border-border bg-surface px-4 py-3">
      <div className="label truncate">{label}</div>
      <div
        className="mt-1.5 truncate font-mono text-xl font-medium tabular-nums tracking-tight text-text"
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
    <div className="rounded-[3px] border border-dashed border-border-strong px-4 py-6 text-center font-mono text-xs text-muted">
      {children}
    </div>
  );
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <code
      className={cx(
        "break-all rounded-[2px] bg-surface-2 px-1 py-0.5 font-mono text-[12px] text-text",
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
    neutral: "border-border-strong bg-surface/70 text-muted",
    warn: "border-warn bg-warn-soft/70 text-warn",
    info: "border-info bg-info-soft/70 text-info",
  }[tone];
  return (
    <div className={cx("flex gap-3 border-l-2 px-4 py-3 text-sm leading-relaxed", styles)}>
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
          <tr className="border-b border-border-strong text-left">
            {head.map((h, i) => (
              <th key={i} className="label px-3 py-2 !text-muted">
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
