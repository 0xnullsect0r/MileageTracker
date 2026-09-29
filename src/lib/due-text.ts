/**
 * How a due item reads in a sentence: "340 mi to go", "overdue by 12 days".
 * The nearer limit leads; the other follows in the secondary line.
 */
import type { DueStatus } from "./maintenance";
import { type VehicleUnits, formatReading, unitLabel } from "./units";

export interface DueText {
  primary: string;
  secondary: string | null;
}

function ticksText(remaining: number, units: VehicleUnits, expires: boolean): string {
  const n = `${formatReading(Math.abs(remaining), units)} ${unitLabel(units)}`;
  if (remaining < 0) return expires ? `expired ${n} ago` : `overdue by ${n}`;
  if (remaining === 0) return expires ? "expires now" : "due now";
  return `${n} ${expires ? "left" : "to go"}`;
}

function daysText(days: number, dueOn: string, expires: boolean): string {
  const verb = expires ? "expires" : "due";
  if (days < 0) return expires ? `expired ${dueOn}` : `overdue since ${dueOn}`;
  if (days === 0) return `${verb} today`;
  if (days === 1) return `${verb} tomorrow`;
  if (days <= 60) return `${verb} in ${days} days`;
  return `${verb} ${dueOn}`;
}

export function describeDue(
  s: DueStatus,
  dueOn: string | null,
  dueReadingTicks: number | null,
  units: VehicleUnits,
  snoozedUntil?: string | null,
  /** Word it for a document: "expires in 10 days", not "due". */
  expires = false,
): DueText {
  const byTicks = s.remainingTicks !== null ? ticksText(s.remainingTicks, units, expires) : null;
  const byDays = s.remainingDays !== null && dueOn ? daysText(s.remainingDays, dueOn, expires) : null;

  let primary: string;
  let secondary: string | null;
  if (byTicks && byDays) {
    [primary, secondary] = s.driver === "date" ? [byDays, `or ${byTicks}`] : [byTicks, `or ${byDays}`];
  } else if (byTicks || byDays) {
    primary = (byTicks ?? byDays)!;
    secondary = null;
  } else if (dueReadingTicks !== null) {
    primary = `${expires ? "expires" : "due"} at ${formatReading(dueReadingTicks, units)} ${unitLabel(units)}`;
    secondary = "no reading logged yet";
  } else {
    primary = "not scheduled";
    secondary = null;
  }
  if (s.snoozed && snoozedUntil) secondary = `snoozed until ${snoozedUntil}`;
  return { primary, secondary };
}
