import "server-only";
import { format } from "date-fns";
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql as raw } from "drizzle-orm";
import { db } from "@/db";
import {
  categories,
  entries,
  serviceReminders,
  vehicleDocuments,
  vehicles,
  type ServiceReminder,
  type VehicleDocument,
} from "@/db/schema";
import { type DeriveEntry, type DerivedEntry, fillGroups, summarise, withDistances } from "@/lib/derive";
import {
  DOCUMENT_KIND_LABEL,
  type DueStatus,
  compareStatus,
  documentStatus,
  dueStatus,
  needsAttention,
} from "@/lib/maintenance";
import { type CostBreakdown, type YearCosts, costsByYear, ownershipCosts } from "@/lib/costs";
import { type VehicleUnits, ticksToUnits } from "@/lib/units";

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

/** Today in the server's timezone (TZ in .env), as yyyy-mm-dd. */
export function todayIso(): string {
  return format(new Date(), "yyyy-MM-dd");
}

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
  dueReminders: ServiceReminder[];
  /** Reminders and documents with their status, most urgent first. */
  dueItems: DueItem[];
  needsReviewCount: number;
  log: LogEntry[];
  documents: VehicleDocument[];
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

  const [reminders, documents] = await Promise.all([loadReminders(vehicleId), loadDocuments(vehicleId)]);
  const units = unitsOf(vehicle);

  return {
    vehicle,
    units,
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
    dueItems: dueItemsFor(vehicle, units, current?.readingTicks ?? null, reminders, documents, todayIso()),
    needsReviewCount: log.filter((e) => e.needsReview).length,
    log,
    documents,
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

/* ----------------------------------------------------------- maintenance */

export async function loadReminders(vehicleId: string): Promise<ServiceReminder[]> {
  return db
    .select()
    .from(serviceReminders)
    .where(and(eq(serviceReminders.vehicleId, vehicleId), eq(serviceReminders.isDone, false)))
    .orderBy(asc(serviceReminders.dueReadingTicks), asc(serviceReminders.dueOn));
}

export async function loadDocuments(vehicleId: string, includeArchived = false): Promise<VehicleDocument[]> {
  const rows = await db
    .select()
    .from(vehicleDocuments)
    .where(eq(vehicleDocuments.vehicleId, vehicleId))
    .orderBy(asc(vehicleDocuments.expiresOn));
  return includeArchived ? rows : rows.filter((d) => !d.isArchived);
}

export interface DueItem {
  id: string;
  type: "reminder" | "document";
  vehicleId: string;
  title: string;
  /** "Insurance", "Registration" — documents only. */
  kindLabel: string | null;
  dueOn: string | null;
  dueReadingTicks: number | null;
  status: DueStatus;
}

export function dueItemsFor(
  vehicle: Pick<VehicleRow, "id">,
  units: VehicleUnits,
  currentTicks: number | null,
  reminders: readonly ServiceReminder[],
  documents: readonly VehicleDocument[],
  today: string,
): DueItem[] {
  const items: DueItem[] = [
    ...reminders.map((r) => ({
      id: r.id,
      type: "reminder" as const,
      vehicleId: vehicle.id,
      title: r.description,
      kindLabel: null,
      dueOn: r.dueMode === "READING" ? null : r.dueOn,
      dueReadingTicks: r.dueMode === "DATE" ? null : r.dueReadingTicks,
      status: dueStatus(r, currentTicks, today, units),
    })),
    ...documents
      .filter((d) => d.expiresOn !== null || d.expiresAtReadingTicks !== null)
      .map((d) => ({
        id: d.id,
        type: "document" as const,
        vehicleId: vehicle.id,
        title: d.title,
        kindLabel: DOCUMENT_KIND_LABEL[d.kind],
        dueOn: d.expiresOn,
        dueReadingTicks: d.expiresAtReadingTicks,
        status: documentStatus(d, currentTicks, today, units),
      })),
  ];
  return items.sort((a, b) => compareStatus(a.status, b.status));
}

/* -------------------------------------------------------------- switcher */

export interface VehicleSummary {
  id: string;
  name: string;
  color: string | null;
  photoAttachmentId: string | null;
  units: VehicleUnits;
  currentReadingTicks: number | null;
  /** Reminders and documents due soon, due, or overdue. */
  attention: number;
  overdue: number;
}

/**
 * Just enough about every vehicle for the switcher, in three queries —
 * never the whole log, because this runs on every page.
 */
export async function listVehicleSummaries(): Promise<VehicleSummary[]> {
  const all = await listVehicles();
  if (all.length === 0) return [];
  const ids = all.map((v) => v.id);

  const [readings, reminders, documents] = await Promise.all([
    db
      .selectDistinctOn([entries.vehicleId], { vehicleId: entries.vehicleId, ticks: entries.readingTicks })
      .from(entries)
      .where(and(inArray(entries.vehicleId, ids), isNull(entries.deletedAt), isNotNull(entries.readingTicks)))
      .orderBy(entries.vehicleId, desc(entries.occurredOn), desc(entries.readingTicks), desc(entries.createdAt)),
    db
      .select()
      .from(serviceReminders)
      .where(and(inArray(serviceReminders.vehicleId, ids), eq(serviceReminders.isDone, false))),
    db
      .select()
      .from(vehicleDocuments)
      .where(and(inArray(vehicleDocuments.vehicleId, ids), eq(vehicleDocuments.isArchived, false))),
  ]);

  const today = todayIso();
  const readingBy = new Map(readings.map((r) => [r.vehicleId, r.ticks]));

  return all.map((v) => {
    const units = unitsOf(v);
    const current = readingBy.get(v.id) ?? null;
    const items = dueItemsFor(
      v,
      units,
      current,
      reminders.filter((r) => r.vehicleId === v.id),
      documents.filter((d) => d.vehicleId === v.id),
      today,
    );
    return {
      id: v.id,
      name: v.name,
      color: v.color,
      photoAttachmentId: v.photoAttachmentId,
      units,
      currentReadingTicks: current,
      attention: items.filter((i) => needsAttention(i.status)).length,
      overdue: items.filter((i) => i.status.state === "overdue").length,
    };
  });
}

/* ----------------------------------------------------------------- costs */

export interface VehicleCosts {
  year: number;
  thisYear: CostBreakdown;
  allTime: CostBreakdown;
  byYear: YearCosts[];
  /** All-time cost per mile / km / hour, when there is distance to divide by. */
  perUnit: number | null;
}

export function vehicleCosts(log: readonly LogEntry[], documents: readonly VehicleDocument[], units: VehicleUnits): VehicleCosts {
  const year = new Date().getFullYear();
  const costEntries = log.map((e) => ({ occurredOn: e.occurredOn, kind: e.category?.kind ?? e.kind, cost: e.cost }));
  const costDocs = documents.map((d) => ({
    startsOn: d.startsOn,
    expiresOn: d.expiresOn,
    createdOn: d.createdAt.toISOString().slice(0, 10),
    cost: num(d.cost),
  }));
  const allTime = ownershipCosts(costEntries, costDocs);
  const distance = summarise(log).totalDistanceTicks;
  return {
    year,
    thisYear: ownershipCosts(costEntries, costDocs, { from: `${year}-01-01`, to: `${year}-12-31` }),
    allTime,
    byYear: costsByYear(costEntries, costDocs),
    perUnit: distance > 0 && allTime.total > 0 ? allTime.total / ticksToUnits(distance, units) : null,
  };
}
