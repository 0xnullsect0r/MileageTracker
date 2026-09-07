/**
 * Outlier detection for imports.
 *
 * Two rules govern everything here:
 *
 *  1. A detector that cries wolf across 3,300 rows is worse than no detector,
 *     so clean rows must produce ZERO findings.
 *  2. Nothing is ever corrected silently. Where the arithmetic is
 *     unambiguous we propose a value; accepting it is the user's act.
 */

export type FindingType =
  | "READING_SPIKE"
  | "READING_REVERSAL"
  | "READING_ORDER"
  | "MISSING_DATE"
  | "FUEL_QTY_IMPLAUSIBLE"
  | "FUEL_QTY_MISSING"
  | "COST_MISMATCH"
  | "DATE_OUT_OF_RANGE"
  | "CATEGORY_MISSING"
  | "CATEGORY_UNKNOWN"
  | "DUPLICATE_ROW";

export type FindingField = "reading" | "fuelQty" | "cost" | "date" | "category" | "row";

export interface Suggestion {
  /** Display form, e.g. "56,698" or "14.0277". */
  label: string;
  /** Machine value: ticks for readings, a plain number otherwise. */
  value: number;
  reason: string;
}

export interface Finding {
  rowRef: string;
  type: FindingType;
  field: FindingField;
  severity: "ERROR" | "WARN";
  message: string;
  suggestions: Suggestion[];
  /** Rows we propose to skip rather than correct. */
  defaultAction: "CORRECT" | "SKIP" | "ASK";
}

export interface ImportRow {
  ref: string;
  occurredOn: string | null;
  readingTicks: number | null;
  categoryCode: string | null;
  description: string | null;
  fuelQty: number | null;
  pricePerUnit: number | null;
  cost: number | null;
}

export interface DetectOptions {
  ticksPerUnit: number;
  /** Fuel units, e.g. gallons. Null when the vehicle has no tank recorded. */
  tankCapacity: number | null;
  knownCategoryCodes: ReadonlySet<string>;
  /** Codes whose kind is FUEL, so we know which rows should carry fuel. */
  fuelCategoryCodes: ReadonlySet<string>;
  minYear?: number;
  maxYear?: number;
  /** The year this sheet claims to cover, when the file is one sheet per year. */
  expectedYear?: number;
}

const CENT = 0.005;

export function detectOutliers(
  rows: readonly ImportRow[],
  opts: DetectOptions,
): Finding[] {
  const findings: Finding[] = [];
  const seen = new Set<string>();
  let lastFillReading: number | null = null;
  let lastGoodReading: number | null = null;

  // Detect against the canonical order, not the order the rows happen to sit
  // in. In the real file a trip is often keyed above the fill-up that
  // preceded it on the same day, which is entry-order noise rather than an
  // error — sorting first removes 7 of 25 apparent violations outright.
  const ordered = [...rows].sort((a, b) => {
    // Undated rows sort LAST. Sorting them first would make an arbitrary
    // reading the baseline for the whole sheet and cascade a false reversal
    // onto every row after it.
    if ((a.occurredOn === null) !== (b.occurredOn === null)) return a.occurredOn === null ? 1 : -1;
    const ad = a.occurredOn ?? "";
    const bd = b.occurredOn ?? "";
    if (ad !== bd) return ad < bd ? -1 : 1;
    const ar = a.readingTicks;
    const br = b.readingTicks;
    if (ar === br) return 0;
    if (ar === null) return 1;
    if (br === null) return -1;
    return ar - br;
  });

  for (let i = 0; i < ordered.length; i++) {
    const row = ordered[i]!;
    const isFuel = row.categoryCode !== null && opts.fuelCategoryCodes.has(row.categoryCode);

    /* -------------------------------------------------- duplicates */
    if (row.occurredOn !== null && row.readingTicks !== null) {
      // Date and reading alone are NOT enough. A trip and a fill-up are
      // routinely logged at the same odometer on the same day — "Ari bus"
      // and "Fuel 76" both at 79,854 — and treating the second as a
      // duplicate silently discarded real fill-ups.
      const key = `${row.occurredOn}|${row.readingTicks}|${row.categoryCode ?? ""}|${row.description ?? ""}`;
      if (seen.has(key)) {
        findings.push({
          rowRef: row.ref,
          type: "DUPLICATE_ROW",
          field: "row",
          severity: "WARN",
          message: `Identical to an earlier row — same date, reading, category and description.`,
          suggestions: [],
          defaultAction: "SKIP",
        });
      }
      seen.add(key);
    }

    /* ----------------------------------------------------- reading */
    if (row.occurredOn === null) {
      // No date means the row cannot be placed in the sequence at all, so it
      // sits out the monotonicity check rather than corrupting the baseline.
      if (row.readingTicks !== null || row.description !== null) {
        findings.push({
          rowRef: row.ref,
          type: "MISSING_DATE",
          field: "date",
          severity: "WARN",
          message: `No date, so this row cannot be placed in the log.`,
          suggestions: [],
          defaultAction: "ASK",
        });
      }
    } else if (row.readingTicks !== null) {
      const next = nextReading(ordered, i);
      const value = row.readingTicks;

      // An odometer only ever climbs. A row out of line with BOTH of its
      // canonical neighbours is the suspect; the row after it is innocent.
      const spiked = lastGoodReading !== null && next !== null && value > next && value > lastGoodReading;
      const reversed = !spiked && lastGoodReading !== null && value < lastGoodReading;

      if (spiked || reversed) {
        const suggestions = repairReading(value, lastGoodReading, next, opts.ticksPerUnit);
        const misdated =
          opts.expectedYear !== undefined &&
          row.occurredOn !== null &&
          Number(row.occurredOn.slice(0, 4)) !== opts.expectedYear;

        if (misdated) {
          // A row sitting in the wrong year is out of sequence because of its
          // DATE, not its reading. Checked first: a digit edit can often be
          // contrived for such a row, and reporting that would send the user
          // to correct a number that was right all along.
          findings.push({
            rowRef: row.ref,
            type: "DATE_OUT_OF_RANGE",
            field: "date",
            severity: "WARN",
            message: `Dated ${row.occurredOn} but sits in the ${opts.expectedYear} sheet, which is why it falls out of order.`,
            suggestions: [
              {
                label: `${opts.expectedYear}${row.occurredOn!.slice(4)}`,
                value: opts.expectedYear!,
                reason: "same day and month, in the year this sheet covers",
              },
            ],
            defaultAction: "ASK",
          });
        } else if (suggestions.length > 0) {
          // A digit edit fits between the neighbours: this is a keystroke.
          findings.push({
            rowRef: row.ref,
            type: "READING_SPIKE",
            field: "reading",
            severity: "ERROR",
            message: `Reading jumps to ${fmt(value, opts.ticksPerUnit)} between ${fmt(lastGoodReading!, opts.ticksPerUnit)} and ${fmt(next!, opts.ticksPerUnit)} — an odometer cannot go back down.`,
            suggestions,
            // Auto-correct only when exactly one edit fits. More than one and
            // the user picks, because a confident wrong suggestion is worse
            // than an honest choice.
            defaultAction: suggestions.length === 1 ? "CORRECT" : "ASK",
          });
        } else {
          // Genuinely out of sequence, but no edit explains it. Worth a
          // look, not worth blocking an import over.
          findings.push({
            rowRef: row.ref,
            type: reversed ? "READING_REVERSAL" : "READING_ORDER",
            field: "reading",
            severity: "WARN",
            message: `Out of sequence: ${fmt(value, opts.ticksPerUnit)} sits between ${fmt(lastGoodReading!, opts.ticksPerUnit)} and ${next !== null ? fmt(next, opts.ticksPerUnit) : "the next entry"}. Check the date or the reading.`,
            suggestions: [],
            defaultAction: "ASK",
          });
        }
        // A suspect value never becomes the baseline for the rows after it.
      } else {
        lastGoodReading = value;
      }
    }

    /* -------------------------------------------------------- fuel */
    if (isFuel) {
      const distance =
        lastFillReading !== null && row.readingTicks !== null
          ? row.readingTicks - lastFillReading
          : null;

      if (row.fuelQty === null) {
        const derivable =
          row.cost !== null && row.pricePerUnit !== null && row.pricePerUnit > 0
            ? row.cost / row.pricePerUnit
            : null;
        findings.push({
          rowRef: row.ref,
          type: "FUEL_QTY_MISSING",
          field: "fuelQty",
          severity: "WARN",
          message: `Fuel row with no quantity, so it cannot join the economy maths.`,
          suggestions:
            derivable !== null
              ? [
                  {
                    label: derivable.toFixed(3),
                    value: round(derivable, 3),
                    reason: `cost ÷ price = ${row.cost} ÷ ${row.pricePerUnit}`,
                  },
                ]
              : [],
          defaultAction: "ASK",
        });
      } else if (isImplausibleQty(row.fuelQty, opts.tankCapacity)) {
        findings.push({
          rowRef: row.ref,
          type: "FUEL_QTY_IMPLAUSIBLE",
          field: "fuelQty",
          severity: "ERROR",
          message: `${row.fuelQty} is far more fuel than this vehicle can hold${
            row.cost !== null ? `, and implies a ${money(row.cost)} fill-up` : ""
          }.`,
          suggestions: repairFuelQty(row, distance, opts),
          defaultAction: "CORRECT",
        });
      } else if (
        row.cost !== null &&
        row.pricePerUnit !== null &&
        Math.abs(row.cost - row.fuelQty * row.pricePerUnit) > CENT
      ) {
        const expected = row.fuelQty * row.pricePerUnit;
        findings.push({
          rowRef: row.ref,
          type: "COST_MISMATCH",
          field: "cost",
          severity: "WARN",
          message: `Cost ${money(row.cost)} does not match ${row.fuelQty} × ${row.pricePerUnit} = ${money(expected)}.`,
          suggestions: [
            { label: expected.toFixed(2), value: round(expected, 2), reason: "quantity × price" },
          ],
          defaultAction: "ASK",
        });
      }

      if (row.readingTicks !== null) lastFillReading = row.readingTicks;
    }

    /* ---------------------------------------------------- category */
    if (row.categoryCode === null || row.categoryCode === "") {
      findings.push({
        rowRef: row.ref,
        type: "CATEGORY_MISSING",
        field: "category",
        severity: "WARN",
        message: `No category code.`,
        suggestions: [],
        defaultAction: "ASK",
      });
    } else if (!opts.knownCategoryCodes.has(row.categoryCode)) {
      findings.push({
        rowRef: row.ref,
        type: "CATEGORY_UNKNOWN",
        field: "category",
        severity: "WARN",
        message: `"${row.categoryCode}" is not in the category key.`,
        suggestions: [],
        defaultAction: "ASK",
      });
    }

    /* -------------------------------------------------------- date */
    if (row.occurredOn !== null) {
      const year = Number(row.occurredOn.slice(0, 4));
      if (
        (opts.minYear !== undefined && year < opts.minYear) ||
        (opts.maxYear !== undefined && year > opts.maxYear)
      ) {
        findings.push({
          rowRef: row.ref,
          type: "DATE_OUT_OF_RANGE",
          field: "date",
          severity: "WARN",
          message: `${row.occurredOn} falls outside the expected range.`,
          suggestions: [],
          defaultAction: "ASK",
        });
      }
    }
  }

  return findings;
}

/* ------------------------------------------------------------ repairs */

/**
 * Digit-edit repair. Try deleting each digit, un-doubling a repeated digit,
 * and un-transposing adjacent pairs; keep only candidates that land between
 * the neighbouring readings.
 *
 * For the real 566698 sitting between 56694 and 56716, exactly one candidate
 * survives: 56698.
 */
export function repairReading(
  valueTicks: number,
  prevTicks: number | null,
  nextTicks: number | null,
  ticksPerUnit: number,
): Suggestion[] {
  const whole = Math.round(valueTicks / ticksPerUnit);
  const digits = String(whole);
  const seen = new Map<number, string>();

  for (let i = 0; i < digits.length; i++) {
    const deleted = digits.slice(0, i) + digits.slice(i + 1);
    if (deleted.length > 0 && !deleted.startsWith("0")) {
      const n = Number(deleted);
      const doubled = i > 0 && digits[i] === digits[i - 1];
      if (!seen.has(n) || doubled) {
        seen.set(n, doubled ? `removes the doubled ${digits[i]}` : `removes a digit`);
      }
    }
  }
  for (let i = 0; i < digits.length - 1; i++) {
    const arr = digits.split("");
    [arr[i], arr[i + 1]] = [arr[i + 1]!, arr[i]!];
    const swapped = arr.join("");
    if (!swapped.startsWith("0")) {
      const n = Number(swapped);
      if (!seen.has(n)) seen.set(n, `un-swaps ${digits[i]}${digits[i + 1]}`);
    }
  }
  // A single mistyped digit is the commonest odometer error of all — in this
  // file, 71252 for 72252. Without this the repair proposes a transposition
  // that merely looks plausible.
  //
  // Only attempted when BOTH neighbours are known: substitution explores a
  // much larger space than deletion, and with an open upper bound it would
  // emit a dozen equally "valid" numbers and call that a suggestion.
  const bounded = prevTicks !== null && nextTicks !== null;
  for (let i = 0; bounded && i < digits.length; i++) {
    for (let d = 0; d <= 9; d++) {
      const ch = String(d);
      if (ch === digits[i]) continue;
      const swapped = digits.slice(0, i) + ch + digits.slice(i + 1);
      if (swapped.startsWith("0")) continue;
      const n = Number(swapped);
      if (!seen.has(n)) seen.set(n, `reads the ${ordinal(i + 1)} digit as ${ch} instead of ${digits[i]}`);
    }
  }

  const lo = prevTicks === null ? null : prevTicks / ticksPerUnit;
  const hi = nextTicks === null ? null : nextTicks / ticksPerUnit;

  const fits = [...seen.entries()].filter(([n]) => {
    if (lo !== null && n < lo) return false;
    if (hi !== null && n > hi) return false;
    return true;
  });

  // Closest to a straight line between the neighbours reads as most likely.
  const target = lo !== null && hi !== null ? (lo + hi) / 2 : (lo ?? hi ?? 0);
  fits.sort((a, b) => Math.abs(a[0] - target) - Math.abs(b[0] - target));

  return fits.slice(0, 3).map(([n, reason]) => ({
    label: n.toLocaleString("en-US"),
    value: n * ticksPerUnit,
    reason: `${reason}; fits between the readings either side`,
  }));
}

/**
 * A quantity like 140277 gallons is a misplaced decimal point. Try each
 * power-of-ten shift and keep the ones that land in a plausible tank range.
 *
 * Cost cannot disambiguate here, because in the source spreadsheet cost was
 * itself a formula over the bad quantity. Distance can: 347 miles on 14.0277
 * gal is 24.7 MPG, while 1.40277 gal would be 247 MPG.
 */
export function repairFuelQty(
  row: Pick<ImportRow, "fuelQty" | "pricePerUnit" | "cost">,
  distanceTicks: number | null,
  opts: Pick<DetectOptions, "tankCapacity" | "ticksPerUnit">,
): Suggestion[] {
  if (row.fuelQty === null) return [];
  const ceiling = (opts.tankCapacity ?? 40) * 1.5;
  const out: Suggestion[] = [];

  for (let p = 1; p <= 6; p++) {
    const shifted = row.fuelQty / 10 ** p;
    if (shifted < 0.5 || shifted > ceiling) continue;

    let economyNote = "";
    let plausibleEconomy = true;
    if (distanceTicks !== null && distanceTicks > 0) {
      const economy = distanceTicks / opts.ticksPerUnit / shifted;
      plausibleEconomy = economy >= 5 && economy <= 80;
      economyNote = ` — ${economy.toFixed(1)} per unit over the recorded distance`;
    }
    if (!plausibleEconomy) continue;

    const cost = row.pricePerUnit !== null ? shifted * row.pricePerUnit : null;
    out.push({
      label: trimNumber(shifted),
      value: round(shifted, 4),
      reason: `decimal point moved ${p} place${p > 1 ? "s" : ""}${
        cost !== null ? `, giving ${money(cost)}` : ""
      }${economyNote}`,
    });
  }
  return out.slice(0, 3);
}

/* ------------------------------------------------------------ helpers */

function nextReading(rows: readonly ImportRow[], i: number): number | null {
  for (let j = i + 1; j < rows.length; j++) {
    const t = rows[j]!.readingTicks;
    if (t !== null) return t;
  }
  return null;
}


function isImplausibleQty(qty: number, tankCapacity: number | null): boolean {
  return qty > (tankCapacity ?? 40) * 1.5;
}

function fmt(ticks: number, ticksPerUnit: number): string {
  return (ticks / ticksPerUnit).toLocaleString("en-US", { maximumFractionDigits: 2 });
}
function money(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function round(n: number, dp: number): number {
  return Math.round(n * 10 ** dp) / 10 ** dp;
}
function trimNumber(n: number): string {
  return String(round(n, 4));
}

function ordinal(n: number): string {
  const suffix = n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th";
  return `${n}${suffix}`;
}
