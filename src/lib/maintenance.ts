/**
 * Maintenance maths: when something is due, and when it is due next.
 *
 * Pure, like lib/derive — dates are ISO yyyy-mm-dd strings and readings are
 * ticks, so it is testable without a database or a clock.
 */
import { addMonths, differenceInCalendarDays, format, parseISO } from "date-fns";
import { type VehicleUnits, ticksPerUnit } from "./units";

export type DueMode = "READING" | "DATE" | "EITHER";
export type DueState = "ok" | "soon" | "due" | "overdue";

export interface ReminderLike {
  dueMode: DueMode;
  dueReadingTicks: number | null;
  dueOn: string | null;
  intervalTicks: number | null;
  intervalMonths: number | null;
  snoozedUntil?: string | null;
}

export interface DueStatus {
  state: DueState;
  /** Ticks left before the reading limit; negative once past it. */
  remainingTicks: number | null;
  /** Days left before the date limit; negative once past it. */
  remainingDays: number | null;
  /** 0 = just done, 1 = due now. Null when there is nothing to measure against. */
  progress: number | null;
  /** Which limit is closer to biting. */
  driver: "reading" | "date" | null;
  snoozed: boolean;
}

const RANK: Record<DueState, number> = { ok: 0, soon: 1, due: 2, overdue: 3 };

export function worse(a: DueState, b: DueState): DueState {
  return RANK[a] >= RANK[b] ? a : b;
}

/** Sorts most urgent first. */
export function compareStatus(a: DueStatus, b: DueStatus): number {
  if (RANK[a.state] !== RANK[b.state]) return RANK[b.state] - RANK[a.state];
  const pa = a.progress ?? -1;
  const pb = b.progress ?? -1;
  return pb - pa;
}

export function needsAttention(s: DueStatus): boolean {
  return s.state !== "ok";
}

export function daysBetween(from: string, to: string): number {
  return differenceInCalendarDays(parseISO(to), parseISO(from));
}

export function addMonthsIso(day: string, months: number): string {
  return format(addMonths(parseISO(day), months), "yyyy-MM-dd");
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function stateFor(remaining: number, window: number): DueState {
  if (remaining < 0) return "overdue";
  if (remaining === 0) return "due";
  if (remaining <= window) return "soon";
  return "ok";
}

/** The "coming up" window when none is given: 10% of the interval, or a sensible default. */
export function defaultSoonTicks(intervalTicks: number | null, units: Pick<VehicleUnits, "meterType">): number {
  if (intervalTicks) return Math.round(intervalTicks * 0.1);
  return units.meterType === "HOURS" ? 10 * ticksPerUnit(units) : 500 * ticksPerUnit(units);
}

export function defaultSoonDays(intervalMonths: number | null): number {
  return intervalMonths !== null && intervalMonths <= 3 ? 14 : 30;
}

interface Limits {
  dueTicks: number | null;
  dueOn: string | null;
  intervalTicks: number | null;
  intervalDays: number | null;
  soonTicks: number;
  soonDays: number;
}

function evaluate(l: Limits, currentTicks: number | null, today: string): Omit<DueStatus, "snoozed"> {
  const remainingTicks = l.dueTicks !== null && currentTicks !== null ? l.dueTicks - currentTicks : null;
  const remainingDays = l.dueOn !== null ? daysBetween(today, l.dueOn) : null;

  let state: DueState = "ok";
  if (remainingTicks !== null) state = worse(state, stateFor(remainingTicks, l.soonTicks));
  if (remainingDays !== null) state = worse(state, stateFor(remainingDays, l.soonDays));

  const pTicks =
    remainingTicks !== null && l.intervalTicks ? clamp01(1 - remainingTicks / l.intervalTicks) : null;
  const pDays =
    remainingDays !== null && l.intervalDays ? clamp01(1 - remainingDays / l.intervalDays) : null;

  let progress: number | null = null;
  let driver: DueStatus["driver"] = null;
  if (pTicks !== null || pDays !== null) {
    if ((pTicks ?? -1) >= (pDays ?? -1)) {
      progress = pTicks;
      driver = "reading";
    } else {
      progress = pDays;
      driver = "date";
    }
  } else if (remainingTicks !== null) {
    driver = "reading";
  } else if (remainingDays !== null) {
    driver = "date";
  }
  if (progress === null && state === "overdue") progress = 1;

  return { state, remainingTicks, remainingDays, progress, driver };
}

export function dueStatus(
  r: ReminderLike,
  currentTicks: number | null,
  today: string,
  units: Pick<VehicleUnits, "meterType">,
): DueStatus {
  const useReading = r.dueMode !== "DATE";
  const useDate = r.dueMode !== "READING";
  const base = evaluate(
    {
      dueTicks: useReading ? r.dueReadingTicks : null,
      dueOn: useDate ? r.dueOn : null,
      intervalTicks: r.intervalTicks,
      intervalDays: r.intervalMonths ? r.intervalMonths * 30.44 : null,
      soonTicks: defaultSoonTicks(r.intervalTicks, units),
      soonDays: defaultSoonDays(r.intervalMonths),
    },
    currentTicks,
    today,
  );
  const snoozed = base.state !== "ok" && !!r.snoozedUntil && r.snoozedUntil > today;
  return snoozed ? { ...base, state: "ok", snoozed } : { ...base, snoozed: false };
}

export interface NextCycle {
  dueReadingTicks: number | null;
  dueOn: string | null;
  /** True for a one-off: nothing to schedule after it. */
  isDone: boolean;
}

/**
 * The next due point after the work was done on `doneOn` at `doneTicks`.
 * The interval runs from when it was actually done, not from when it was due.
 */
export function nextCycle(
  r: Pick<ReminderLike, "dueMode" | "intervalTicks" | "intervalMonths" | "dueReadingTicks">,
  doneOn: string,
  doneTicks: number | null,
): NextCycle {
  const byReading = r.dueMode !== "DATE" && !!r.intervalTicks;
  const byDate = r.dueMode !== "READING" && !!r.intervalMonths;
  if (!byReading && !byDate) return { dueReadingTicks: null, dueOn: null, isDone: true };

  let dueReadingTicks: number | null = null;
  if (byReading) {
    const from = doneTicks ?? (r.dueReadingTicks !== null ? r.dueReadingTicks : null);
    dueReadingTicks = from === null ? null : from + r.intervalTicks!;
  }
  const dueOn = byDate ? addMonthsIso(doneOn, r.intervalMonths!) : null;
  return { dueReadingTicks, dueOn, isDone: false };
}

/* ------------------------------------------------------------ documents */

export type DocumentKind = "REGISTRATION" | "INSURANCE" | "INSPECTION" | "EMISSIONS" | "WARRANTY" | "OTHER";

export const DOCUMENT_KIND_LABEL: Record<DocumentKind, string> = {
  REGISTRATION: "Registration",
  INSURANCE: "Insurance",
  INSPECTION: "Inspection",
  EMISSIONS: "Emissions",
  WARRANTY: "Warranty",
  OTHER: "Other",
};

export interface DocumentLike {
  kind: DocumentKind;
  startsOn: string | null;
  expiresOn: string | null;
  expiresAtReadingTicks: number | null;
  isArchived: boolean;
}

export function documentStatus(
  d: DocumentLike,
  currentTicks: number | null,
  today: string,
  units: Pick<VehicleUnits, "meterType">,
): DueStatus {
  if (d.isArchived) {
    return { state: "ok", remainingTicks: null, remainingDays: null, progress: null, driver: null, snoozed: false };
  }
  const intervalDays = d.startsOn && d.expiresOn ? Math.max(1, daysBetween(d.startsOn, d.expiresOn)) : null;
  const base = evaluate(
    {
      dueTicks: d.expiresAtReadingTicks,
      dueOn: d.expiresOn,
      intervalTicks: null,
      intervalDays,
      soonTicks: defaultSoonTicks(null, units),
      soonDays: d.kind === "REGISTRATION" ? 60 : 30,
    },
    currentTicks,
    today,
  );
  return { ...base, snoozed: false };
}
