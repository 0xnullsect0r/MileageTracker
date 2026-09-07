/**
 * Units — the single owner of every reading conversion in this codebase.
 *
 * Readings are stored as an exact integer `reading_ticks`. Ticks per unit is
 * fixed by METER TYPE, not by precision:
 *
 *   DISTANCE -> 100 ticks per mile/km (hundredths)
 *   HOURS    -> 60  ticks per hour    (minutes)
 *
 * The consequence that matters: `precision` is a DISPLAY concern only, so
 * switching a tractor from whole hours to hours+minutes is a config toggle,
 * never a data migration. Deltas are exact integer subtraction, so nothing
 * drifts across 3,300 rows.
 *
 * Nothing else in this codebase may divide by 100 or 60.
 */

export type MeterType = "DISTANCE" | "HOURS";
export type DistanceUnit = "MI" | "KM";
export type ReadingPrecision = "WHOLE" | "TENTHS" | "HOURS_MINUTES";

export interface VehicleUnits {
  meterType: MeterType;
  distanceUnit: DistanceUnit;
  readingPrecision: ReadingPrecision;
}

export const TICKS_PER_DISTANCE_UNIT = 100;
export const TICKS_PER_HOUR = 60;

export function ticksPerUnit(v: Pick<VehicleUnits, "meterType">): number {
  return v.meterType === "HOURS" ? TICKS_PER_HOUR : TICKS_PER_DISTANCE_UNIT;
}

/** The precisions that actually make sense for a given meter type. */
export function allowedPrecisions(meterType: MeterType): ReadingPrecision[] {
  return meterType === "HOURS"
    ? ["WHOLE", "TENTHS", "HOURS_MINUTES"]
    : ["WHOLE", "TENTHS"];
}

export function isPrecisionValid(v: VehicleUnits): boolean {
  return allowedPrecisions(v.meterType).includes(v.readingPrecision);
}

/** Short label for the unit itself: "mi", "km", "h". */
export function unitLabel(v: VehicleUnits): string {
  if (v.meterType === "HOURS") return "h";
  return v.distanceUnit === "KM" ? "km" : "mi";
}

/** Longer label used in prose and column headers. */
export function unitNoun(v: VehicleUnits, plural = true): string {
  if (v.meterType === "HOURS") return plural ? "hours" : "hour";
  if (v.distanceUnit === "KM") return plural ? "kilometres" : "kilometre";
  return plural ? "miles" : "mile";
}

export class ReadingParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReadingParseError";
  }
}

/**
 * Parse user input into exact ticks.
 *
 * Accepts, per precision:
 *   WHOLE / TENTHS  -> "12345", "12,345.6", " 12345.60 "
 *   HOURS_MINUTES   -> "210:25", "210", "210:5"
 *
 * Rejects negatives, blanks and junk. Values finer than the vehicle's
 * precision are rounded to that precision rather than silently truncated,
 * so a pasted "12345.67" on a WHOLE vehicle becomes 12346, not 12345.
 */
export function parseReading(input: string, v: VehicleUnits): number {
  const raw = input.trim().replace(/,/g, "");
  if (raw === "") throw new ReadingParseError("Enter a reading.");

  if (v.meterType === "HOURS" && v.readingPrecision === "HOURS_MINUTES") {
    return parseHoursMinutes(raw);
  }

  if (!/^\d+(\.\d+)?$/.test(raw)) {
    throw new ReadingParseError(`"${input.trim()}" is not a number.`);
  }

  const value = Number(raw);
  if (!Number.isFinite(value)) throw new ReadingParseError("Reading is out of range.");

  const per = ticksPerUnit(v);
  const step = v.readingPrecision === "TENTHS" ? per / 10 : per;
  return Math.round((value * per) / step) * step;
}

function parseHoursMinutes(raw: string): number {
  const m = /^(\d+):([0-5]?\d)$/.exec(raw);
  if (m) {
    const hours = Number(m[1]);
    const minutes = Number(m[2]);
    return hours * TICKS_PER_HOUR + minutes;
  }
  if (/^\d+$/.test(raw)) return Number(raw) * TICKS_PER_HOUR;
  if (/^\d+:\d+$/.test(raw)) {
    throw new ReadingParseError("Minutes must be between 00 and 59.");
  }
  throw new ReadingParseError(`Enter hours and minutes as "210:25".`);
}

/** Parse the paired hours + minutes controls used in HOURS_MINUTES mode. */
export function parseHoursAndMinutes(hours: string, minutes: string): number {
  const h = hours.trim() === "" ? "0" : hours.trim();
  const mm = minutes.trim() === "" ? "0" : minutes.trim();
  if (!/^\d+$/.test(h)) throw new ReadingParseError("Hours must be a whole number.");
  if (!/^\d+$/.test(mm)) throw new ReadingParseError("Minutes must be a whole number.");
  const minuteValue = Number(mm);
  if (minuteValue > 59) throw new ReadingParseError("Minutes must be between 0 and 59.");
  return Number(h) * TICKS_PER_HOUR + minuteValue;
}

/** Split ticks back into the paired hours + minutes controls. */
export function toHoursAndMinutes(ticks: number): { hours: number; minutes: number } {
  return {
    hours: Math.floor(ticks / TICKS_PER_HOUR),
    minutes: ticks % TICKS_PER_HOUR,
  };
}

export interface FormatOptions {
  /** Thousands separators. Off for input fields, on for display. */
  grouped?: boolean;
  /** Append "mi" / "km" / "h". */
  withUnit?: boolean;
}

/** Render ticks at the vehicle's display precision. */
export function formatReading(
  ticks: number,
  v: VehicleUnits,
  opts: FormatOptions = {},
): string {
  const { grouped = true, withUnit = false } = opts;
  const body = formatBody(ticks, v, grouped);
  return withUnit ? `${body} ${unitLabel(v)}` : body;
}

function formatBody(ticks: number, v: VehicleUnits, grouped: boolean): string {
  const negative = ticks < 0;
  const abs = Math.abs(ticks);
  let out: string;

  if (v.meterType === "HOURS" && v.readingPrecision === "HOURS_MINUTES") {
    const { hours, minutes } = toHoursAndMinutes(abs);
    out = `${group(hours, grouped)}:${String(minutes).padStart(2, "0")}`;
  } else {
    const per = ticksPerUnit(v);
    if (v.readingPrecision === "TENTHS") {
      const tenths = Math.round(abs / (per / 10));
      const whole = Math.floor(tenths / 10);
      out = `${group(whole, grouped)}.${tenths % 10}`;
    } else {
      out = group(Math.round(abs / per), grouped);
    }
  }
  return negative ? `-${out}` : out;
}

function group(n: number, grouped: boolean): string {
  return grouped ? n.toLocaleString("en-US") : String(n);
}

/**
 * A delta between two readings, signed, for the Δ column and the live
 * "+312 mi" check on the quick-entry screen.
 */
export function formatDelta(
  ticks: number,
  v: VehicleUnits,
  opts: FormatOptions = {},
): string {
  const sign = ticks > 0 ? "+" : "";
  return `${sign}${formatReading(ticks, v, { withUnit: true, ...opts })}`;
}

/** Convert ticks to a plain number in the vehicle's unit, for maths and charts. */
export function ticksToUnits(ticks: number, v: Pick<VehicleUnits, "meterType">): number {
  return ticks / ticksPerUnit(v);
}

export function unitsToTicks(value: number, v: Pick<VehicleUnits, "meterType">): number {
  return Math.round(value * ticksPerUnit(v));
}

/** Props for a single reading <input>. HOURS_MINUTES uses paired controls instead. */
export function readingInputProps(v: VehicleUnits): {
  inputMode: "numeric" | "decimal";
  step: string;
  placeholder: string;
  pattern?: string;
} {
  if (v.meterType === "HOURS" && v.readingPrecision === "HOURS_MINUTES") {
    return { inputMode: "numeric", step: "1", placeholder: "210:25", pattern: "[0-9]+:[0-5][0-9]" };
  }
  if (v.readingPrecision === "TENTHS") {
    return { inputMode: "decimal", step: "0.1", placeholder: v.meterType === "HOURS" ? "210.4" : "12345.6" };
  }
  return { inputMode: "numeric", step: "1", placeholder: v.meterType === "HOURS" ? "210" : "12345" };
}

/**
 * Split a formatted reading into the digits that are shared with a reference
 * reading and the digits that changed.
 *
 * This is the signature of the whole interface: unchanged digits recede, so
 * scanning the odometer column shows a staircase, and a typo breaks it.
 * Comparison is right-aligned on the string, so "56698" vs "566698" yields a
 * short shared tail rather than a misleading shared head.
 */
export function splitChangedDigits(
  value: string,
  reference: string | null,
): { shared: string; changed: string } {
  if (reference === null || reference === "") return { shared: "", changed: value };
  if (value.length !== reference.length) return { shared: "", changed: value };

  let i = 0;
  while (i < value.length && value[i] === reference[i]) i++;

  // Never recede the entire number — if nothing changed, show it all as changed.
  if (i >= value.length) return { shared: "", changed: value };
  return { shared: value.slice(0, i), changed: value.slice(i) };
}
