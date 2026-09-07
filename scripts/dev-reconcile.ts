/**
 * Reconcile per-sheet fuel totals against the spreadsheet.
 *
 * The measured figures were taken by summing each sheet as-is, which counts
 * the carry-forward rows the importer deliberately skips. This proves the
 * difference is exactly those rows and nothing else.
 */
import { readFileSync } from "node:fs";
import { listVehicles, loadLog } from "@/lib/data";
import { summarise } from "@/lib/derive";
import type { ParsedDocument } from "@/lib/import/mapping";
import { autoMap, buildRows } from "@/lib/import/mapping";
import { buildPlan, resolve } from "@/lib/import/plan";

const doc = JSON.parse(readFileSync("tests/fixtures/marshal.json", "utf8")) as ParsedDocument;
const tables = doc.sheets.filter((s) => /^(19|20)\d{2}$/.test(s.name)).map((s) => ({ sheet: s.name, table: "Trips, Gas, Service" }));
const plan = buildPlan(doc, {
  tables, ticksPerUnit: 100, tankCapacity: 12.4,
  knownCategoryCodes: new Set(["B", "P", "G", "S", "I"]),
  fuelCategoryCodes: new Set(["G"]), minYear: 2016, maxYear: 2027,
});
const skippedBySheet = new Map<string, { cost: number; qty: number; n: number }>();
for (const r of resolve(plan, [])) {
  if (!r.skip || r.categoryCode !== "G") continue;
  const cur = skippedBySheet.get(r.sheet) ?? { cost: 0, qty: 0, n: 0 };
  cur.cost += r.cost ?? 0; cur.qty += r.fuelQty ?? 0; cur.n++;
  skippedBySheet.set(r.sheet, cur);
}

const [vehicle] = await listVehicles();
const log = await loadLog(vehicle!.id);
const bySheet = new Map<string, typeof log>();
for (const e of log) {
  const sheet = e.importRowRef?.split("!")[0] ?? "?";
  const list = bySheet.get(sheet) ?? []; list.push(e); bySheet.set(sheet, list);
}

// Sheet totals straight from the fixture, exactly as measured during planning.
const sheetTotals = new Map<string, { cost: number; qty: number }>();
for (const s of doc.sheets) {
  const t = s.tables.find((x) => x.name === "Trips, Gas, Service");
  if (!t) continue;
  const { rows } = buildRows(s.name, t, autoMap(t.headers));
  let cost = 0, qty = 0;
  for (const r of rows) if (r.categoryCode === "G") { cost += r.cost ?? 0; qty += r.fuelQty ?? 0; }
  sheetTotals.set(s.name, { cost, qty });
}

console.log("sheet   sheet total   skipped dups   expected   imported     diff");
let worst = 0;
for (const year of ["2016","2017","2018","2019","2020","2021","2022","2023","2024","2025"]) {
  const total = sheetTotals.get(year)!;
  const skipped = skippedBySheet.get(year) ?? { cost: 0, qty: 0, n: 0 };
  // 2022's sheet total includes the 140277-gallon typo; use the corrected figure.
  const corrected = year === "2022" ? total.cost - 715272.423 + 14.0277 * 5.099 : total.cost;
  const expect = corrected - skipped.cost;
  const got = summarise(bySheet.get(year) ?? []).fuelSpend;
  const diff = got - expect;
  worst = Math.max(worst, Math.abs(diff));
  console.log(
    `${year} ${corrected.toFixed(2).padStart(13)} ${(-skipped.cost).toFixed(2).padStart(14)} ${expect.toFixed(2).padStart(10)} ${got.toFixed(2).padStart(10)} ${diff.toFixed(2).padStart(8)}`,
  );
}
console.log(`\nlargest unexplained difference: $${worst.toFixed(2)}`);
process.exit(worst < 0.05 ? 0 : 1);
