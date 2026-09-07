/**
 * Development harness: run the real spreadsheet through the real import
 * pipeline and into the real database. Exercises exactly the code path the
 * wizard uses, so what it reports is what the UI will report.
 */
import { readFileSync } from "node:fs";
import { db } from "@/db";
import { vehicles } from "@/db/schema";
import { commitImport } from "@/lib/import/commit";
import type { ParsedDocument } from "@/lib/import/mapping";
import { buildPlan, resolve, type Decision } from "@/lib/import/plan";

const doc = JSON.parse(readFileSync("tests/fixtures/marshal.json", "utf8")) as ParsedDocument;

const vehicle = (
  await db
    .insert(vehicles)
    .values({
      name: "Marshal",
      year: 2016,
      make: "Honda",
      model: "Civic",
      meterType: "DISTANCE",
      distanceUnit: "MI",
      readingPrecision: "WHOLE",
      fuelUnit: "GAL_US",
      tankCapacity: "12.4",
      purchaseDate: "2016-11-28",
    })
    .returning()
)[0]!;

const tables = doc.sheets
  .filter((s) => /^(19|20)\d{2}$/.test(s.name))
  .map((s) => ({ sheet: s.name, table: "Trips, Gas, Service" }));

const plan = buildPlan(doc, {
  tables,
  ticksPerUnit: 100,
  tankCapacity: 12.4,
  knownCategoryCodes: new Set(["B", "P", "G", "S", "I"]),
  fuelCategoryCodes: new Set(["G"]),
  minYear: 2016,
  maxYear: 2027,
});

// Accept every unambiguous correction; leave the rest for the review queue.
const decisions: Decision[] = plan.findings
  .filter((f) => f.defaultAction === "CORRECT" && f.suggestions.length === 1)
  .map((f) => ({ rowRef: f.rowRef, field: f.field, action: "CORRECT" as const, value: f.suggestions[0]!.value }));

const rows = resolve(plan, decisions);

// The service-note tables become reminders.
const reminders: { description: string; dueReadingTicks: number | null; dueOn: string | null; intervalTicks: number | null }[] = [];
for (const sheet of doc.sheets) {
  for (const t of sheet.tables) {
    if (!/note|reminder|due/i.test(t.name)) continue;
    const dateCol = t.headers.findIndex((h) => /date/i.test(h));
    const readCol = t.headers.findIndex((h) => /milage|mileage|odom/i.test(h));
    const descCol = t.headers.findIndex((h) => /desc/i.test(h));
    for (const row of t.rows) {
      const desc = descCol >= 0 ? row[descCol] : null;
      if (typeof desc !== "string" || desc.trim() === "") continue;
      // "LAST SERVICE: Honda oil, tires..." is a record of work done, not
      // something due. Importing it as a reminder put a permanent "overdue"
      // on the dashboard for a job already finished.
      if (/^\s*last\b/i.test(desc)) continue;
      const reading = readCol >= 0 && typeof row[readCol] === "number" ? Math.round((row[readCol] as number) * 100) : null;
      const on = dateCol >= 0 && typeof row[dateCol] === "string" ? (row[dateCol] as string).slice(0, 10) : null;
      reminders.push({
        description: desc.trim(),
        dueReadingTicks: reading,
        dueOn: on,
        intervalTicks: /every\s*5k/i.test(desc) ? 500000 : null,
      });
    }
  }
}

const result = await commitImport({
  vehicleId: vehicle.id,
  filename: "Car Log - Marshal.numbers",
  userId: null,
  plan,
  rows,
  reminders,
});

console.log("plan:", plan.stats);
console.log("corrections accepted:", decisions.length);
console.log("commit:", result);
process.exit(0);
