import "server-only";
import { and, asc, desc, eq, isNull, sql as raw } from "drizzle-orm";
import { db } from "@/db";
import { categories, entries, serviceReminders, vehicles } from "@/db/schema";
import { type DeriveEntry, type DerivedEntry, fillGroups, summarise, withDistances } from "@/lib/derive";
import type { VehicleUnits } from "@/lib/units";

export type VehicleRow = typeof vehicles.$inferSelect;
export type CategoryRow = typeof categories.$inferSelect;

export function unitsOf(v: Pick<VehicleRow, "meterType" | "distanceUnit" | "readingPrecision">): VehicleUnits {
  return {
    meterType: v.meterType,
    distanceUnit: v.distanceUnit,
    readingPrecision: v.readingPrecision,
  };
}

const num = (v: string | null): number | null => (v === null ? null : Number(v));

export async function listVehicles(includeArchived = false): Promise<VehicleRow[]> {
  const rows = await db.select().from(vehicles).orderBy(asc(vehicles.sortOrder), asc(vehicles.createdAt));
  return includeArchived ? rows : rows.filter((v) => v.isActive);
}

export async function getVehicle(id: string): Promise<VehicleRow | null> {
  const rows = await db.select().from(vehicles).where(eq(vehicles.id, id)).limit(1);
  return rows[0] ?? null;
}

/** Global categories plus any specific to this vehicle. */
export async function listCategories(vehicleId?: string): Promise<CategoryRow[]> {
  const rows = await db
    .select()
    .from(categories)
    .where(
      vehicleId
        ? raw`(${categories.vehicleId} is null or ${categories.vehicleId} = ${vehicleId})`
        : isNull(categories.vehicleId),
    )
    .orderBy(asc(categories.sortOrder));
  return rows.filter((c) => !c.isArchived);
}

export interface LogEntry extends DerivedEntry {
  description: string | null;
  notes: string | null;
  vendor: string | null;
  fuelPricePerUnit: number | null;
  needsReview: boolean;
  reviewReason: string | null;
  importOriginalValue: string | null;
  importRowRef: string | null;
  category: CategoryRow | null;
}

/**
 * The whole log for a vehicle, with distances attached.
 *
 * Deliberately loads every entry rather than paginating in SQL: distance and
 * fuel economy are chain calculations, so a window of rows cannot produce a
 * correct delta for its own first row. At this size (3,300 rows) the whole
 * chain is cheap, and the table virtualises on the client.
 */
export async function loadLog(vehicleId: string): Promise<LogEntry[]> {
  const rows = await db
    .select({ e: entries, c: categories })
    .from(entries)
    .leftJoin(categories, eq(categories.id, entries.categoryId))
    .where(and(eq(entries.vehicleId, vehicleId), isNull(entries.deletedAt)))
    .orderBy(asc(entries.occurredOn), asc(entries.readingTicks), asc(entries.createdAt));

  const base: DeriveEntry[] = rows.map(({ e, c }) => ({
    id: e.id,
    occurredOn: e.occurredOn,
    readingTicks: e.readingTicks,
    kind: c?.kind ?? "TRIP",
    isBusiness: c?.isBusiness ?? false,
    fuelQty: num(e.fuelQty),
    cost: num(e.cost),
    isPartialFill: e.isPartialFill,
    isMissedFill: e.isMissedFill,
    odometerReset: e.odometerReset,
    createdAt: e.createdAt.toISOString(),
    categoryId: e.categoryId,
  }));

  const derived = withDistances(base);
  const byId = new Map(rows.map(({ e, c }) => [e.id, { e, c }]));

  return derived.map((d) => {
    const found = byId.get(d.id)!;
    return {
      ...d,
      description: found.e.description,
      notes: found.e.notes,
      vendor: found.e.vendor,
      fuelPricePerUnit: num(found.e.fuelPricePerUnit),
      needsReview: found.e.needsReview,
      reviewReason: found.e.reviewReason,
      importOriginalValue: found.e.importOriginalValue,
      importRowRef: found.e.importRowRef,
      category: found.c,
    };
  });
}

export interface VehicleOverview {
  vehicle: VehicleRow;
  units: VehicleUnits;
  currentReadingTicks: number | null;
  previousReadingTicks: number | null;
  lastEntryOn: string | null;
  daysSinceLastEntry: number | null;
  /** That vehicle's own typical gap between entries, for the staleness cue. */
  typicalGapDays: number | null;
  entryCount: number;
  ytd: ReturnType<typeof summarise>;
  allTime: ReturnType<typeof summarise>;
  /** Economy over the last few full tanks — stable, unlike a young year. */
  recentEconomyTicksPerUnit: number | null;
  dueReminders: (typeof serviceReminders.$inferSelect)[];
  needsReviewCount: number;
}

export async function vehicleOverview(vehicleId: string): Promise<VehicleOverview | null> {
  const vehicle = await getVehicle(vehicleId);
  if (!vehicle) return null;

  const log = await loadLog(vehicleId);
  const withReading = log.filter((e) => e.readingTicks !== null);
  const current = withReading.at(-1) ?? null;
  const previous = withReading.at(-2) ?? null;

  const year = new Date().getFullYear();
  const lastEntryOn = log.at(-1)?.occurredOn ?? null;
  const daysSince =
    lastEntryOn === null
      ? null
      : Math.floor((Date.now() - new Date(`${lastEntryOn}T00:00:00`).getTime()) / 864e5);

  const reminders = await db
    .select()
    .from(serviceReminders)
    .where(and(eq(serviceReminders.vehicleId, vehicleId), eq(serviceReminders.isDone, false)))
    .orderBy(asc(serviceReminders.dueReadingTicks));

  return {
    vehicle,
    units: unitsOf(vehicle),
    currentReadingTicks: current?.readingTicks ?? null,
    previousReadingTicks: previous?.readingTicks ?? null,
    lastEntryOn,
    daysSinceLastEntry: daysSince,
    typicalGapDays: typicalGap(log.map((e) => e.occurredOn)),
    entryCount: log.length,
    ytd: summarise(log, { from: `${year}-01-01`, to: `${year}-12-31` }),
    allTime: summarise(log),
    recentEconomyTicksPerUnit: recentEconomy(log),
    dueReminders: reminders,
    needsReviewCount: log.filter((e) => e.needsReview).length,
  };
}

/**
 * Economy across the last six usable fill groups.
 *
 * A calendar-year figure is worthless in January: two fills in the new year
 * gave the dashboard 42.1 mpg on a car that averages 25.
 */
function recentEconomy(log: readonly DerivedEntry[]): number | null {
  const groups = fillGroups(log).filter((g) => !g.excluded).slice(-6);
  const distance = groups.reduce((a, g) => a + g.distanceTicks, 0);
  const fuel = groups.reduce((a, g) => a + g.fuelQty, 0);
  return fuel > 0 ? distance / fuel : null;
}

/** Median gap between consecutive entry dates, in days. */
function typicalGap(days: readonly string[]): number | null {
  if (days.length < 8) return null;
  const gaps: number[] = [];
  for (let i = 1; i < days.length; i++) {
    const d = (new Date(`${days[i]}T00:00:00`).getTime() - new Date(`${days[i - 1]}T00:00:00`).getTime()) / 864e5;
    if (d >= 0) gaps.push(d);
  }
  if (gaps.length === 0) return null;
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)] ?? null;
}

export async function latestReadingTicks(vehicleId: string): Promise<number | null> {
  const rows = await db
    .select({ r: entries.readingTicks })
    .from(entries)
    .where(and(eq(entries.vehicleId, vehicleId), isNull(entries.deletedAt)))
    .orderBy(desc(entries.occurredOn), desc(entries.readingTicks))
    .limit(1);
  return rows[0]?.r ?? null;
}
