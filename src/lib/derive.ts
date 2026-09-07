/**
 * Derived calculations.
 *
 * This is the module that beats the spreadsheet. The Numbers file computed
 * economy as `miles-since-previous-fuel-row / gallons`, which is wrong the
 * moment a tank is only topped up: the real file contains 69.61 MPG (a 4.4
 * gal splash after 309 mi) immediately followed by 5.35 MPG (66 mi on 12.3
 * gal). Those are one 375-mile stretch on 16.8 gallons — 22.3 MPG.
 *
 * Everything here is pure and works on an ordered array, so it is testable
 * without a database.
 */

export type CategoryKind = "TRIP" | "FUEL" | "SERVICE" | "NOTE";

export interface DeriveEntry {
  id: string;
  occurredOn: string; // ISO yyyy-mm-dd
  readingTicks: number | null;
  kind: CategoryKind;
  isBusiness: boolean;
  fuelQty: number | null;
  cost: number | null;
  isPartialFill: boolean;
  isMissedFill: boolean;
  odometerReset: boolean;
  createdAt: string;
  categoryId: string | null;
}

export interface DerivedEntry extends DeriveEntry {
  /** Ticks travelled since the previous reading. Null when the chain breaks. */
  distanceTicks: number | null;
  /** True when this entry closed a fill group (a full tank). */
  closesFillGroup: boolean;
}

/** occurred_on ASC, reading ASC (nulls last), created_at ASC. */
export function orderEntries<T extends DeriveEntry>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) => {
    if (a.occurredOn !== b.occurredOn) return a.occurredOn < b.occurredOn ? -1 : 1;
    const ar = a.readingTicks;
    const br = b.readingTicks;
    if (ar !== br) {
      if (ar === null) return 1;
      if (br === null) return -1;
      return ar - br;
    }
    return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
  });
}

/**
 * Attach the distance travelled into each entry.
 *
 * A NOTE row that carries a reading is still a legitimate odometer
 * observation, so it stays in the chain — that is what makes the "Starting
 * milage" anchor row work. What a NOTE does *not* do is contribute to the
 * business/personal split, which is handled in `summarise`.
 *
 * `odometerReset` breaks the chain instead of producing a garbage negative.
 */
export function withDistances(entries: readonly DeriveEntry[]): DerivedEntry[] {
  const ordered = orderEntries(entries);
  let previousReading: number | null = null;

  return ordered.map((e) => {
    let distanceTicks: number | null = null;

    if (e.odometerReset) {
      previousReading = e.readingTicks ?? null;
    } else if (e.readingTicks !== null) {
      if (previousReading === null) {
        previousReading = e.readingTicks;
      } else if (e.readingTicks >= previousReading) {
        distanceTicks = e.readingTicks - previousReading;
        previousReading = e.readingTicks;
      }
      // A reading BELOW the previous one, with no reset declared, is
      // suspect. It gets no distance, and — critically — it does not become
      // the new baseline: adopting it would make the next legitimate reading
      // look like an enormous journey. One mis-dated row in the real file
      // invented 85,000 miles that way.
    }

    return {
      ...e,
      distanceTicks,
      closesFillGroup: e.kind === "FUEL" && !e.isPartialFill,
    };
  });
}

export interface FillGroup {
  /** The full-tank entry that closed this group. */
  closedBy: DerivedEntry;
  /** Every fuel entry in the group, partials first, closer last. */
  fills: DerivedEntry[];
  startReadingTicks: number;
  endReadingTicks: number;
  distanceTicks: number;
  fuelQty: number;
  cost: number;
  /** Ticks per unit of fuel. Null when the group cannot be trusted. */
  economyTicksPerUnit: number | null;
  excluded: boolean;
  excludedReason?: string;
}

/**
 * Group fills full-tank to full-tank, absorbing partial fills in between.
 *
 * The first full tank in a vehicle's history opens the first group but
 * cannot close one — there is no earlier full tank to measure from, so no
 * economy is reported for it rather than a fabricated number.
 */
export function fillGroups(derived: readonly DerivedEntry[]): FillGroup[] {
  const groups: FillGroup[] = [];
  let anchor: DerivedEntry | null = null; // previous full tank
  let pending: DerivedEntry[] = [];
  let sinceAnchor = 0;

  for (const e of derived) {
    // Accumulate the guarded per-row distances rather than subtracting one
    // reading from another. A single suspect reading on a fuel row would
    // otherwise inflate the whole stretch — the same failure the distance
    // chain guards against.
    if (anchor !== null) sinceAnchor += e.distanceTicks ?? 0;

    if (e.kind !== "FUEL") {
      if (e.odometerReset) {
        anchor = null;
        pending = [];
        sinceAnchor = 0;
      }
      continue;
    }

    pending.push(e);
    if (e.isPartialFill) continue;

    if (anchor !== null && anchor.readingTicks !== null && e.readingTicks !== null) {
      const fuelQty = sum(pending.map((f) => f.fuelQty ?? 0));
      const cost = sum(pending.map((f) => f.cost ?? 0));
      const distanceTicks = sinceAnchor;
      const missed = pending.some((f) => f.isMissedFill);
      const noFuel = pending.some((f) => f.fuelQty === null);

      let excludedReason: string | undefined;
      if (missed) excludedReason = "A fill-up in this stretch was marked as missed.";
      else if (noFuel) excludedReason = "A fill-up in this stretch has no quantity recorded.";
      else if (fuelQty <= 0) excludedReason = "No fuel quantity recorded.";
      else if (distanceTicks <= 0) excludedReason = "Readings did not advance between fill-ups.";

      groups.push({
        closedBy: e,
        fills: pending,
        startReadingTicks: anchor.readingTicks,
        endReadingTicks: e.readingTicks,
        distanceTicks,
        fuelQty,
        cost,
        economyTicksPerUnit: excludedReason ? null : distanceTicks / fuelQty,
        excluded: excludedReason !== undefined,
        ...(excludedReason ? { excludedReason } : {}),
      });
    }

    anchor = e;
    pending = [];
    sinceAnchor = 0;
  }

  return excludeImplausibleEconomy(groups);
}

/**
 * A tank reading 175 mpg on a car that averages 25 did not happen: a fill-up
 * in that stretch went unrecorded, so its distance is attributed to the next
 * tank. These are marked rather than dropped — the spend is still real — but
 * they are kept out of averages and out of the chart's scale, where a single
 * one otherwise squashes a decade of honest readings into a band.
 *
 * The band is derived from the vehicle's own median, not hardcoded, so it
 * works for a 12 mpg truck and a 60 mpg motorcycle alike.
 */
function excludeImplausibleEconomy(groups: FillGroup[]): FillGroup[] {
  const usable = groups.filter((g) => !g.excluded && g.economyTicksPerUnit !== null);
  if (usable.length < 8) return groups;

  const sorted = usable.map((g) => g.economyTicksPerUnit!).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  const high = median * 2.2;
  const low = median * 0.45;

  return groups.map((g) => {
    if (g.excluded || g.economyTicksPerUnit === null) return g;
    if (g.economyTicksPerUnit > high) {
      return { ...g, excluded: true, economyTicksPerUnit: null, excludedReason: "Far above this vehicle's usual — a fill-up in this stretch was probably not recorded." };
    }
    if (g.economyTicksPerUnit < low) {
      return { ...g, excluded: true, economyTicksPerUnit: null, excludedReason: "Far below this vehicle's usual — this stretch is probably missing distance." };
    }
    return g;
  });
}

export interface PeriodSummary {
  totalDistanceTicks: number;
  businessDistanceTicks: number;
  personalDistanceTicks: number;
  /** Distance on NOTE rows — real travel, but attributable to neither. */
  unclassifiedDistanceTicks: number;
  fuelSpend: number;
  serviceSpend: number;
  fuelQty: number;
  entryCount: number;
  fillCount: number;
  /**
   * Aggregate economy: total distance between the first and last full tank
   * in the period, over the fuel burned in between. Never an average of
   * per-fill figures.
   */
  aggregateEconomyTicksPerUnit: number | null;
  costPerTick: number | null;
}

export interface PeriodBounds {
  from?: string;
  to?: string;
}

export function summarise(
  entries: readonly DeriveEntry[],
  bounds: PeriodBounds = {},
): PeriodSummary {
  // Distances are computed over the FULL history, then filtered — otherwise
  // the first entry of a period would lose the distance that led into it.
  const derived = withDistances(entries);
  const inPeriod = derived.filter((e) => within(e.occurredOn, bounds));

  let total = 0;
  let business = 0;
  let personal = 0;
  let unclassified = 0;
  let fuelSpend = 0;
  let serviceSpend = 0;
  let fuelQty = 0;
  let fillCount = 0;

  for (const e of inPeriod) {
    const d = e.distanceTicks;
    if (d !== null && d > 0) {
      total += d;
      if (e.kind === "NOTE" || e.categoryId === null) unclassified += d;
      else if (e.isBusiness) business += d;
      else personal += d;
    }
    if (e.kind === "FUEL") {
      fuelSpend += e.cost ?? 0;
      fuelQty += e.fuelQty ?? 0;
      fillCount++;
    } else if (e.kind === "SERVICE") {
      serviceSpend += e.cost ?? 0;
    } else {
      serviceSpend += e.cost ?? 0; // an out-of-pocket cost on a trip row
    }
  }

  const groups = fillGroups(derived).filter(
    (g) => within(g.closedBy.occurredOn, bounds) && !g.excluded,
  );
  const groupDistance = sum(groups.map((g) => g.distanceTicks));
  const groupFuel = sum(groups.map((g) => g.fuelQty));

  return {
    totalDistanceTicks: total,
    businessDistanceTicks: business,
    personalDistanceTicks: personal,
    unclassifiedDistanceTicks: unclassified,
    fuelSpend: round2(fuelSpend),
    serviceSpend: round2(serviceSpend),
    fuelQty: round3(fuelQty),
    entryCount: inPeriod.length,
    fillCount,
    aggregateEconomyTicksPerUnit: groupFuel > 0 ? groupDistance / groupFuel : null,
    costPerTick: total > 0 ? (fuelSpend + serviceSpend) / total : null,
  };
}

function within(day: string, { from, to }: PeriodBounds): boolean {
  if (from !== undefined && day < from) return false;
  if (to !== undefined && day > to) return false;
  return true;
}

function sum(xs: readonly number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
