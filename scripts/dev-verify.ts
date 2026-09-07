/** Check derived output against figures measured from the spreadsheet itself. */
import { loadLog, listVehicles, unitsOf } from "@/lib/data";
import { summarise } from "@/lib/derive";
import { formatReading, ticksToUnits } from "@/lib/units";

const [vehicle] = await listVehicles();
if (!vehicle) throw new Error("no vehicle");
const units = unitsOf(vehicle);
const log = await loadLog(vehicle.id);

console.log(`${vehicle.name}: ${log.length} entries`);
const withReading = log.filter((e) => e.readingTicks !== null);
console.log(`current reading: ${formatReading(withReading.at(-1)!.readingTicks!, units)}`);
console.log(`range: ${log[0]!.occurredOn} .. ${log.at(-1)!.occurredOn}\n`);

// Measured from the .numbers file during planning.
const expected: Record<string, [number, number]> = {
  "2025": [908.55, 236.3],
  "2024": [1657.49, 432.5],
  "2023": [1208.21, 309.1],
  "2021": [1331.21, 418.8],
  "2019": [1915.47, 656.6],
  "2017": [1938.22, 735.5],
};

// Compared per SHEET, not per calendar year: the measured figures came from
// summing each sheet, and the 2025 sheet carries 2026 rows.
const bySheet = new Map<string, typeof log>();
for (const e of log) {
  const sheet = (e as unknown as { importRowRef?: string }).importRowRef?.split("!")[0] ?? "?";
  const list = bySheet.get(sheet) ?? [];
  list.push(e);
  bySheet.set(sheet, list);
}

console.log("sheet  fuel spend    gallons   expected spend  expected gal   match");
for (const year of ["2016","2017","2018","2019","2020","2021","2022","2023","2024","2025"]) {
  const s = summarise(bySheet.get(year) ?? []);
  const exp = expected[year];
  const okSpend = exp ? Math.abs(s.fuelSpend - exp[0]) < 2.5 : null;
  const okGal = exp ? Math.abs(s.fuelQty - exp[1]) < 1.5 : null;
  console.log(
    `${year}  ${s.fuelSpend.toFixed(2).padStart(10)} ${s.fuelQty.toFixed(1).padStart(10)}` +
    (exp ? `  ${exp[0].toFixed(2).padStart(13)} ${exp[1].toFixed(1).padStart(13)}   ${okSpend && okGal ? "OK" : "MISMATCH"}` : "              -             -"),
  );
}

const all = summarise(log);
console.log(`\ntotal distance: ${formatReading(all.totalDistanceTicks, units)} mi`);
console.log(`business: ${formatReading(all.businessDistanceTicks, units)}  personal: ${formatReading(all.personalDistanceTicks, units)}  unclassified: ${formatReading(all.unclassifiedDistanceTicks, units)}`);
console.log(`aggregate economy: ${all.aggregateEconomyTicksPerUnit ? ticksToUnits(all.aggregateEconomyTicksPerUnit, units).toFixed(2) : "—"} mpg  (sheet median per-fill was 20.5)`);
console.log(`flagged for review: ${log.filter((e) => e.needsReview).length}`);
process.exit(0);
