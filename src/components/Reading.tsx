import { cn } from "@/lib/cn";
import {
  type VehicleUnits,
  formatDelta,
  formatReading,
  splitChangedDigits,
  unitLabel,
} from "@/lib/units";

type Size = "sm" | "md" | "lg" | "hero";

const SIZE: Record<Size, string> = {
  sm: "text-[0.8125rem]",
  md: "text-base",
  lg: "text-[2rem] leading-none",
  hero: "text-[2.5rem] leading-none sm:text-[3.5rem]",
};

/**
 * A reading, rendered as digits that carry meaning independently.
 *
 * When `reference` is supplied (the previous row's reading), the digits it
 * shares with this one recede to --ink-muted. Scanning a column of these
 * shows a staircase: only the last two or three digits move from row to row.
 * A typo breaks the staircase, which is how a wrong number is caught by
 * position before colour is even involved.
 */
export function Reading({
  ticks,
  units,
  reference = null,
  size = "md",
  withUnit = false,
  className,
}: {
  ticks: number | null;
  units: VehicleUnits;
  reference?: number | null;
  size?: Size;
  withUnit?: boolean;
  className?: string;
}) {
  if (ticks === null) {
    return <span className={cn("num text-ink-muted", SIZE[size], className)}>—</span>;
  }

  const value = formatReading(ticks, units);
  const ref = reference === null ? null : formatReading(reference, units);
  const { shared, changed } = splitChangedDigits(value, ref);

  return (
    <span className={cn("num tracking-tight", SIZE[size], className)}>
      {shared !== "" && <span className="text-ink-muted">{shared}</span>}
      <span>{changed}</span>
      {withUnit && <span className="ml-1 text-ink-muted">{unitLabel(units)}</span>}
    </span>
  );
}

/**
 * A value produced by arithmetic rather than typed by a person. The tick
 * ground marks the distinction — only one of the two can be wrong on its own,
 * and that is worth being able to see.
 */
export function Computed({
  children,
  className,
  title,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn("computed num inline-block px-1 text-ink-muted", className)}
    >
      {children}
    </span>
  );
}

export function Delta({
  ticks,
  units,
  className,
}: {
  ticks: number | null;
  units: VehicleUnits;
  className?: string;
}) {
  if (ticks === null) return <span className="num text-ink-muted">—</span>;
  return <Computed className={className}>{formatDelta(ticks, units)}</Computed>;
}

/** Any other figure: money, gallons, MPG. Mono, tabular, right-aligned. */
export function Num({
  value,
  dp = 2,
  prefix = "",
  suffix = "",
  className,
}: {
  value: number | null | undefined;
  dp?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  if (value === null || value === undefined) {
    return <span className={cn("num text-ink-muted", className)}>—</span>;
  }
  return (
    <span className={cn("num", className)}>
      {prefix}
      {value.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })}
      {suffix}
    </span>
  );
}
