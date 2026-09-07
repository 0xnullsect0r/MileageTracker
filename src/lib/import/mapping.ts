/**
 * Turning a parsed spreadsheet into import rows.
 *
 * Deliberately conservative: it proposes a mapping and a shape, and the user
 * confirms both. Nothing here writes anything.
 */

export type FieldTarget =
  | "date"
  | "reading"
  | "category"
  | "description"
  | "pricePerUnit"
  | "fuelQty"
  | "cost"
  | "ignore";

export interface ParsedTable {
  name: string;
  headers: string[];
  rows: (string | number | null)[][];
  numRows?: number;
}
export interface ParsedSheet {
  name: string;
  tables: ParsedTable[];
}
export interface ParsedDocument {
  filename: string;
  sheets: ParsedSheet[];
}

export interface ColumnMapping {
  /** Index into the header row -> what it becomes. */
  targets: FieldTarget[];
}

const ALIASES: Record<string, FieldTarget> = {
  date: "date",
  when: "date",
  milage: "reading",
  odometer: "reading",
  odo: "reading",
  reading: "reading",
  hours: "reading",
  hourmeter: "reading",
  c: "category",
  cat: "category",
  category: "category",
  type: "category",
  description: "description",
  desc: "description",
  note: "description",
  notes: "description",
  memo: "description",
  "$/gal": "pricePerUnit",
  "$/gallon": "pricePerUnit",
  "price/gal": "pricePerUnit",
  price: "pricePerUnit",
  ppg: "pricePerUnit",
  gallons: "fuelQty",
  gallon: "fuelQty",
  gal: "fuelQty",
  litres: "fuelQty",
  liters: "fuelQty",
  quantity: "fuelQty",
  qty: "fuelQty",
  cost: "cost",
  total: "cost",
  amount: "cost",
  spend: "cost",
};

function norm(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, "");
}

/**
 * Auto-map a header row.
 *
 * The trap this file sets: it has BOTH "Milage" (column B — the odometer,
 * misspelled) and "Mileage" (column I — the computed MPG). Mapping on a
 * fuzzy match would silently import MPG as the odometer. So when both are
 * present, the misspelling wins the reading and "Mileage" is ignored.
 *
 * "Miles" and "Mileage" are ignored regardless when a reading column exists,
 * because both are recomputed by lib/derive — importing them would preserve
 * the spreadsheet's own broken partial-fill maths.
 */
export function autoMap(headers: readonly string[]): ColumnMapping {
  const n = headers.map(norm);
  const hasMilage = n.includes("milage");
  const targets: FieldTarget[] = headers.map((h, i) => {
    const key = n[i]!;
    if (key === "" ) return "ignore";
    if (key === "miles") return "ignore";
    if (key === "mileage") return hasMilage ? "ignore" : "reading";
    return ALIASES[key] ?? "ignore";
  });

  // A target may only be claimed once; later duplicates fall back to ignore.
  const claimed = new Set<FieldTarget>();
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i]!;
    if (t === "ignore") continue;
    if (claimed.has(t)) targets[i] = "ignore";
    else claimed.add(t);
  }
  return { targets };
}

export interface RawRow {
  ref: string;
  date: string | null;
  readingRaw: number | null;
  categoryCode: string | null;
  description: string | null;
  pricePerUnit: number | null;
  fuelQty: number | null;
  cost: number | null;
}

const LOG_TABLE_HINTS = ["trip", "gas", "service", "log", "mileage", "milage", "fuel"];

export interface SheetShape {
  /** Tables that look like the main entry log, in sheet order. */
  logTables: { sheet: string; table: string; rows: number }[];
  /** Small side tables — service notes, category keys. */
  sideTables: { sheet: string; table: string; rows: number; looksLikeReminders: boolean }[];
  /** True when the file is one sheet per year, which is this file's shape. */
  yearPerSheet: boolean;
}

export function detectShape(doc: ParsedDocument): SheetShape {
  const logTables: SheetShape["logTables"] = [];
  const sideTables: SheetShape["sideTables"] = [];

  for (const sheet of doc.sheets) {
    for (const table of sheet.tables) {
      const mapping = autoMap(table.headers);
      const hasReading = mapping.targets.includes("reading");
      const hasDate = mapping.targets.includes("date");
      const isReminders = /note|reminder|due/i.test(table.name);
      // Checked before the log hints: "Next Service Notes" carries a date and
      // a mileage and would otherwise match the "service" hint and be
      // imported as a log table.
      const named = !isReminders && LOG_TABLE_HINTS.some((h) => table.name.toLowerCase().includes(h));
      const big = table.rows.length >= 20;

      if (!isReminders && hasReading && (hasDate || named) && (big || named)) {
        logTables.push({ sheet: sheet.name, table: table.name, rows: table.rows.length });
      } else {
        sideTables.push({
          sheet: sheet.name,
          table: table.name,
          rows: table.rows.length,
          looksLikeReminders: isReminders,
        });
      }
    }
  }

  const yearSheets = doc.sheets.filter((s) => /^(19|20)\d{2}$/.test(s.name.trim()));
  return { logTables, sideTables, yearPerSheet: yearSheets.length >= 2 };
}

export function isBlankRow(row: readonly (string | number | null)[]): boolean {
  return row.every((c) => c === null || (typeof c === "string" && c.trim() === ""));
}

/** Apply a mapping to a table's rows. Blank rows are dropped, not imported. */
export function buildRows(
  sheetName: string,
  table: ParsedTable,
  mapping: ColumnMapping,
): { rows: RawRow[]; blankRowsDropped: number } {
  const rows: RawRow[] = [];
  let blankRowsDropped = 0;

  table.rows.forEach((raw, i) => {
    if (isBlankRow(raw)) {
      blankRowsDropped++;
      return;
    }
    // +2: one for the header row, one because spreadsheets are 1-indexed.
    const row: RawRow = {
      ref: `${sheetName}!${i + 2}`,
      date: null,
      readingRaw: null,
      categoryCode: null,
      description: null,
      pricePerUnit: null,
      fuelQty: null,
      cost: null,
    };

    mapping.targets.forEach((target, col) => {
      const cell = raw[col] ?? null;
      if (cell === null || target === "ignore") return;
      switch (target) {
        case "date":
          row.date = asDate(cell);
          break;
        case "reading":
          row.readingRaw = asNumber(cell);
          break;
        case "category":
          row.categoryCode = asCode(cell);
          break;
        case "description":
          row.description = asText(cell);
          break;
        case "pricePerUnit":
          row.pricePerUnit = asNumber(cell);
          break;
        case "fuelQty":
          row.fuelQty = asNumber(cell);
          break;
        case "cost":
          row.cost = asNumber(cell);
          break;
      }
    });

    rows.push(row);
  });

  return { rows, blankRowsDropped };
}

function asDate(cell: string | number): string | null {
  if (typeof cell === "number") return null;
  const s = cell.trim();
  // The parser already reduces datetimes to yyyy-mm-dd; the stray times in
  // the source are timezone artifacts, and the date is the datum.
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function asNumber(cell: string | number): number | null {
  if (typeof cell === "number") return Number.isFinite(cell) ? cell : null;
  const s = cell.replace(/[$,\s]/g, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function asCode(cell: string | number): string | null {
  const s = String(cell).trim().toUpperCase();
  return s === "" ? null : s;
}

function asText(cell: string | number): string | null {
  const s = String(cell).trim();
  return s === "" ? null : s;
}
