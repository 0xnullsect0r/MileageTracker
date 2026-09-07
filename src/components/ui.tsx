import { cn } from "@/lib/cn";

/** Hairlines are the primary structural device. No shadows, anywhere. */
export function Rule({ strong = false, className }: { strong?: boolean; className?: string }) {
  return (
    <hr
      className={cn("border-0 bg-rule", strong ? "h-[1.5px]" : "h-px", className)}
      aria-hidden
    />
  );
}

/** Uppercase micro-label above a figure. Sans, tracked, never mono. */
export function Label({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "block text-[0.75rem] font-semibold uppercase tracking-[0.06em] text-ink-muted",
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * A figure with its label directly above it. Never a floating tile — a
 * detached stat goes meaningless the moment a tractor with no fuel data
 * joins the garage.
 */
export function Stat({
  label,
  children,
  hint,
  className,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <Label>{label}</Label>
      <div className="mt-1">{children}</div>
      {hint && <div className="mt-0.5 text-sm text-ink-muted">{hint}</div>}
    </div>
  );
}

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-[2px] px-4 min-h-11 text-[0.9375rem] font-semibold transition-colors duration-100 disabled:opacity-50 disabled:pointer-events-none";

export function Button({
  variant = "secondary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "quiet" | "danger";
}) {
  const styles = {
    primary: "bg-signal text-paper hover:brightness-110",
    secondary: "border border-ink text-ink hover:bg-ink hover:text-paper",
    quiet: "text-ink-muted hover:text-ink",
    danger: "text-ink-muted hover:text-signal border border-rule hover:border-signal",
  }[variant];
  return <button className={cn(BUTTON_BASE, styles, className)} {...props} />;
}

/** Bottom-border-only fields: filling into paper, not into a card. */
export function Field({
  label,
  hint,
  error,
  className,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={cn("block", className)}>
      <Label>{label}</Label>
      <div className="mt-1">{children}</div>
      {hint && !error && <p className="mt-1 text-sm text-ink-muted">{hint}</p>}
      {error && (
        <p className="mt-1 text-sm font-semibold" style={{ color: "var(--signal)" }}>
          {error}
        </p>
      )}
    </label>
  );
}

export const inputClass =
  "w-full min-h-11 border-0 border-b border-rule bg-transparent px-0 py-2 text-base text-ink " +
  "focus:border-signal focus:outline-none placeholder:text-ink-muted";

export function Banner({
  tone = "flag",
  children,
}: {
  tone?: "flag" | "quiet";
  children: React.ReactNode;
}) {
  if (tone === "quiet") {
    return (
      <div className="border-l-[3px] border-rule bg-paper-raised px-4 py-3 text-sm">{children}</div>
    );
  }
  // --signal-bright is 2.26:1 and never carries text itself; --ink sits on it.
  return (
    <div
      className="border-l-[3px] px-4 py-3 text-sm text-ink"
      style={{ borderLeftColor: "var(--signal)", background: "color-mix(in srgb, var(--signal-bright) 22%, transparent)" }}
    >
      {children}
    </div>
  );
}
