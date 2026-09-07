/**
 * Turning a parsed document into a reviewable, committable plan.
 *
 * Pure and database-free so it can be tested against the real spreadsheet.
 * The wizard renders what this produces; committing applies it.
 */
import {
  type ColumnMapping,
  type ParsedDocument,
  type RawRow,
  autoMap,
  buildRows,
} from "./mapping";
import { type DetectOptions, type Finding, type ImportRow, detectOutliers } from "./outliers";

export interface PlanRow extends ImportRow {
  sheet: string;
  /** Set when this row repeats one already seen in an earlier sheet. */
  duplicateOf: string | null;
}

export interface ImportPlan {
  rows: PlanRow[];
  findings: Finding[];
  stats: {
    rowsRead: number;
    blankRowsDropped: number;
    duplicatesAcrossSheets: number;
    errors: number;
    warnings: number;
  };
}

export interface PlanOptions extends Omit<DetectOptions, "expectedYear"> {
  /** Sheet name -> table name. Usually every "Trips, Gas, Service" table. */
  tables: { sheet: string; table: string }[];
  mappingFor?: (headers: string[]) => ColumnMapping;
}

export function buildPlan(doc: ParsedDocument, opts: PlanOptions): ImportPlan {
  const mapper = opts.mappingFor ?? autoMap;
  const rows: PlanRow[] = [];
  const findings: Finding[] = [];
  let blankRowsDropped = 0;

  // Chronological, whatever order the caller passed. The file lists its
  // sheets newest-first, and dedupe keeps the FIRST occurrence — process it
  // in that order and the real fill-up gets skipped in favour of the
  // placeholder copy that follows it.
  const orderedTables = [...opts.tables].sort((a, b) =>
    a.sheet.localeCompare(b.sheet, "en", { numeric: true }),
  );

  for (const { sheet, table } of orderedTables) {
    const sheetDoc = doc.sheets.find((s) => s.name === sheet);
    const tableDoc = sheetDoc?.tables.find((t) => t.name === table);
    if (!tableDoc) continue;

    const mapping = mapper(tableDoc.headers);
    const built = buildRows(sheet, tableDoc, mapping);
    blankRowsDropped += built.blankRowsDropped;

    const asImport = built.rows.map((r) => toImportRow(sheet, r));
    rows.push(...asImport);

    // Year checks need the sheet's own year, so detection runs per sheet.
    const year = /^(19|20)\d{2}$/.test(sheet.trim()) ? Number(sheet.trim()) : undefined;
    findings.push(
      ...detectOutliers(asImport, { ...opts, ...(year !== undefined ? { expectedYear: year } : {}) }),
    );
  }

  // Cross-sheet duplicates. Each year sheet in this file opens by repeating
  // the previous year's last fill-up, which per-sheet detection cannot see
  // and which would otherwise double-count those fills.
  //
  // Matched on the READING alone, not on date + reading: only one of the six
  // carry-forward rows keeps the original date, the rest use a January 1st
  // placeholder. An odometer reading recurring in a different sheet is
  // essentially always this pattern — and the placeholder date is itself a
  // reason to skip, since it would drop a December reading into January and
  // manufacture a reversal.
  const seen = new Map<number, string>();
  let duplicatesAcrossSheets = 0;
  for (const row of rows) {
    if (row.readingTicks === null) continue;
    const key = row.readingTicks;
    const first = seen.get(key);
    if (first !== undefined && first.split("!")[0] !== row.sheet) {
      row.duplicateOf = first;
      duplicatesAcrossSheets++;
      findings.push({
        rowRef: row.ref,
        type: "DUPLICATE_ROW",
        field: "row",
        severity: "WARN",
        message: `Same reading as ${first} in an earlier sheet — the year sheets carry the previous year's last fill-up forward. Importing both would count it twice.`,
        suggestions: [],
        defaultAction: "SKIP",
      });
    } else if (first === undefined) {
      seen.set(key, row.ref);
    }
  }

  // A row may attract several findings; the worst one decides its fate.
  const deduped = dedupeFindings(findings);

  return {
    rows,
    findings: deduped,
    stats: {
      rowsRead: rows.length,
      blankRowsDropped,
      duplicatesAcrossSheets,
      errors: deduped.filter((f) => f.severity === "ERROR").length,
      warnings: deduped.filter((f) => f.severity === "WARN").length,
    },
  };
}

/** One finding per row per field; ERROR beats WARN. */
function dedupeFindings(findings: readonly Finding[]): Finding[] {
  const best = new Map<string, Finding>();
  for (const f of findings) {
    const key = `${f.rowRef}|${f.field}`;
    const existing = best.get(key);
    if (!existing || (existing.severity === "WARN" && f.severity === "ERROR")) {
      best.set(key, f);
    }
  }
  return [...best.values()];
}

function toImportRow(sheet: string, r: RawRow): PlanRow {
  return {
    ref: r.ref,
    sheet,
    occurredOn: r.date,
    readingTicks: r.readingRaw === null ? null : Math.round(r.readingRaw * 100),
    categoryCode: r.categoryCode,
    description: r.description,
    fuelQty: r.fuelQty,
    pricePerUnit: r.pricePerUnit,
    cost: r.cost,
    duplicateOf: null,
  };
}

/* ----------------------------------------------------------- decisions */

export type DecisionAction = "CORRECT" | "KEEP" | "SKIP";

export interface Decision {
  rowRef: string;
  field: string;
  action: DecisionAction;
  /** For CORRECT: the accepted value, in the finding's own units. */
  value?: number;
}

export interface ResolvedRow extends PlanRow {
  skip: boolean;
  /** Set when a correction changed a value, so the original stays recoverable. */
  originalNote: string | null;
  needsReview: boolean;
  reviewReason: string | null;
}

/**
 * Apply the user's decisions. Findings left undecided fall back to their
 * defaultAction, EXCEPT corrections — an unreviewed correction is never
 * applied silently; the row imports as it stands and is flagged for review.
 */
export function resolve(plan: ImportPlan, decisions: readonly Decision[]): ResolvedRow[] {
  const byRow = new Map<string, Decision[]>();
  for (const d of decisions) {
    const list = byRow.get(d.rowRef) ?? [];
    list.push(d);
    byRow.set(d.rowRef, list);
  }
  const findingsByRow = new Map<string, Finding[]>();
  for (const f of plan.findings) {
    const list = findingsByRow.get(f.rowRef) ?? [];
    list.push(f);
    findingsByRow.set(f.rowRef, list);
  }

  return plan.rows.map((row) => {
    const decisions = byRow.get(row.ref) ?? [];
    const findings = findingsByRow.get(row.ref) ?? [];
    const out: ResolvedRow = {
      ...row,
      skip: false,
      originalNote: null,
      needsReview: false,
      reviewReason: null,
    };

    for (const f of findings) {
      const d = decisions.find((x) => x.field === f.field);
      const action: DecisionAction = d?.action ?? (f.defaultAction === "SKIP" ? "SKIP" : "KEEP");

      if (action === "SKIP") {
        out.skip = true;
        continue;
      }
      if (action === "CORRECT" && d?.value !== undefined) {
        applyCorrection(out, f.field, d.value);
        continue;
      }
      // Kept as-is: import it, but say why it was questioned.
      out.needsReview = true;
      out.reviewReason = out.reviewReason ? `${out.reviewReason} ${f.message}` : f.message;
    }
    return out;
  });
}

function applyCorrection(row: ResolvedRow, field: string, value: number): void {
  switch (field) {
    case "reading":
      row.originalNote = `reading was ${row.readingTicks}`;
      row.readingTicks = value;
      break;
    case "fuelQty":
      row.originalNote = `quantity was ${row.fuelQty}`;
      row.fuelQty = value;
      if (row.pricePerUnit !== null) row.cost = round2(value * row.pricePerUnit);
      break;
    case "cost":
      row.originalNote = `cost was ${row.cost}`;
      row.cost = value;
      break;
    case "date":
      if (row.occurredOn !== null) {
        row.originalNote = `date was ${row.occurredOn}`;
        row.occurredOn = `${value}${row.occurredOn.slice(4)}`;
      }
      break;
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
