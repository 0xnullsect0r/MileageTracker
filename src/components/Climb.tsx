import { cn } from "@/lib/cn";
import { formatReading, type VehicleUnits } from "@/lib/units";

export interface ClimbEntry {
  readingTicks: number | null;
  occurredOn: string;
  kind: "TRIP" | "FUEL" | "SERVICE" | "NOTE";
  needsReview?: boolean;
}

const BUCKETS = 200;

/**
 * The Climb — a vehicle's whole history on its real odometer scale.
 *
 * Ticks are positioned by actual reading, not by row index, which is what
 * makes it tell the truth: a dense cluster is a month of commuting, a gap is
 * a month the car sat, and a reading that breaks the climb shows up as a
 * mark stranded far from its neighbours.
 *
 * Density is bucketed so 3,300 entries become at most 200 nodes. It is
 * navigation, not decoration — it appears above the log as a scrubber and on
 * the import screen as context, and nowhere else.
 */
export function Climb({
  entries,
  units,
  className,
  height = 44,
  robustScale = false,
}: {
  entries: readonly ClimbEntry[];
  units: VehicleUnits;
  className?: string;
  height?: number;
  /** Scale to the bulk of the data and pin outliers to the edge. */
  robustScale?: boolean;
}) {
  const readings = entries
    .filter((e): e is ClimbEntry & { readingTicks: number } => e.readingTicks !== null)
    .map((e) => ({ ...e }));

  if (readings.length < 2) return null;

  // On an import, a single bad reading can be five times the real maximum.
  // Scaling to it squashes a decade into the left tenth of the strip and
  // tells you nothing, so scale to the bulk and pin the outliers to the edge
  // where they still read as "something is out there".
  const sorted = readings.map((r) => r.readingTicks).sort((a, b) => a - b);
  const pick = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))]!;
  const min = robustScale ? pick(0.01) : sorted[0]!;
  const max = robustScale ? pick(0.99) : sorted[sorted.length - 1]!;
  const span = Math.max(1, max - min);
  const pos = (ticks: number) => Math.min(100, Math.max(0, ((ticks - min) / span) * 100));
  const outOfRange = (ticks: number) => ticks < min || ticks > max;

  const density = new Array<number>(BUCKETS).fill(0);
  for (const r of readings) {
    const b = Math.min(BUCKETS - 1, Math.max(0, Math.floor(((r.readingTicks - min) / span) * BUCKETS)));
    density[b] = (density[b] ?? 0) + 1;
  }
  const peak = Math.max(...density, 1);

  // Only marks that stay legible at this density. With 359 fill-ups across
  // 200 buckets, drawing every one produced a solid wall of colour that said
  // nothing; the density histogram already carries "how hard it was worked".
  const marks = readings.filter((r) => r.kind === "SERVICE" || r.needsReview);
  const fuelBuckets = new Set(
    readings
      .filter((r) => r.kind === "FUEL")
      .map((r) => Math.min(BUCKETS - 1, Math.max(0, Math.floor(((r.readingTicks - min) / span) * BUCKETS)))),
  );

  return (
    <figure className={cn("w-full", className)}>
      <div
        className="relative w-full border-b border-rule"
        style={{ height }}
        role="img"
        aria-label={`History from ${formatReading(min, units)} to ${formatReading(max, units)}, ${readings.length} entries.`}
      >
        {/* Density: how hard the vehicle was worked across its life.
            Buckets holding a fill-up take the fuel hue, so the rhythm of
            filling up is legible without drawing 359 separate ticks. */}
        {density.map((count, i) =>
          count === 0 ? null : (
            <div
              key={`d${i}`}
              className="absolute bottom-0"
              style={{
                left: `${(i / BUCKETS) * 100}%`,
                width: `${100 / BUCKETS}%`,
                height: `${Math.max(8, (count / peak) * 100)}%`,
                // Both tints derive from theme tokens rather than a fixed
                // hex: --rule is nearly invisible on the dark ground, which
                // left the fuel buckets shouting over an empty histogram.
                background: fuelBuckets.has(i)
                  ? "color-mix(in srgb, var(--cat-gas) 45%, transparent)"
                  : "color-mix(in srgb, var(--ink-muted) 38%, transparent)",
              }}
            />
          ),
        )}
        {/* Services and anything flagged, on the real scale. */}
        {marks.map((m, i) => (
          <div
            key={`m${i}`}
            className="absolute bottom-0 w-px"
            style={{
              left: `${pos(m.readingTicks)}%`,
              height: m.needsReview ? "100%" : m.kind === "SERVICE" ? "80%" : "55%",
              // An out-of-range mark is drawn thicker at the edge it ran off,
              // so it is not mistaken for an ordinary entry sitting there.
              width: outOfRange(m.readingTicks) ? "3px" : "1px",
              background: m.needsReview
                ? "var(--signal)"
                : m.kind === "SERVICE"
                  ? "var(--cat-service)"
                  : "var(--cat-gas)",
            }}
          />
        ))}
      </div>
      <figcaption className="mt-1 flex justify-between text-[0.75rem] text-ink-muted">
        <span className="num">{formatReading(min, units)}</span>
        <span className="num">
          {formatReading(max, units)}
          {robustScale && sorted[sorted.length - 1]! > max && " +"}
        </span>
      </figcaption>
    </figure>
  );
}
