/**
 * Development harness: a small, plausible garage — a car, a truck and a
 * tractor — for building and screenshotting the UI without the real
 * spreadsheet. Run against an empty dev database after bootstrap.
 *
 *   pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/dev-seed.ts
 */
import { addDays, format } from "date-fns";
import { db } from "@/db";
import { categories, entries, serviceReminders, vehicleDocuments, vehicles } from "@/db/schema";

const cats = await db.select().from(categories);
const code = (c: string) => cats.find((x) => x.code === c)!.id;

// Deterministic, so screenshots are comparable run to run.
let seed = 42;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

const iso = (d: Date) => format(d, "yyyy-MM-dd");
const today = new Date();

async function vehicle(values: typeof vehicles.$inferInsert) {
  return (await db.insert(vehicles).values(values).returning())[0]!;
}

async function drive(vehicleId: string, start: Date, startMiles: number, days: number, perDay: number, mpg: number) {
  const rows: (typeof entries.$inferInsert)[] = [];
  let miles = startMiles;
  let sinceFill = 0;
  let sinceOil = 0;
  rows.push({ vehicleId, categoryId: code("I"), occurredOn: iso(start), readingTicks: miles * 100, description: "Starting mileage" });
  for (let d = 1; d <= days; d++) {
    if (rand() < 0.45) continue;
    const trip = Math.round(perDay * (0.4 + rand() * 1.6));
    miles += trip;
    sinceFill += trip;
    sinceOil += trip;
    const day = iso(addDays(start, d));
    const business = rand() < 0.35;
    rows.push({
      vehicleId,
      categoryId: code(business ? "B" : "P"),
      occurredOn: day,
      readingTicks: miles * 100,
      description: business ? ["Client visit", "Site survey", "Supplier run"][Math.floor(rand() * 3)] : ["Errands", "Groceries", "School run", "Gym"][Math.floor(rand() * 4)],
    });
    if (sinceFill > 280 + rand() * 60) {
      const qty = +(sinceFill / (mpg * (0.9 + rand() * 0.2))).toFixed(3);
      const price = +(3.05 + rand() * 0.6).toFixed(3);
      rows.push({
        vehicleId,
        categoryId: code("G"),
        occurredOn: day,
        readingTicks: miles * 100,
        description: ["Shell", "Sunoco", "Wawa", "Costco"][Math.floor(rand() * 4)],
        fuelQty: String(qty),
        fuelPricePerUnit: String(price),
        cost: (qty * price).toFixed(2),
      });
      sinceFill = 0;
    }
    if (sinceOil > 5000) {
      rows.push({ vehicleId, categoryId: code("S"), occurredOn: day, readingTicks: miles * 100, description: "Oil change", vendor: "Valvoline", cost: (69 + rand() * 30).toFixed(2) });
      sinceOil = 0;
    }
  }
  for (let i = 0; i < rows.length; i += 500) await db.insert(entries).values(rows.slice(i, i + 500));
  return miles;
}

const civic = await vehicle({ name: "Marshal", year: 2016, make: "Honda", model: "Civic", color: "blue", tankCapacity: "12.4", sortOrder: 0 });
const civicMiles = await drive(civic.id, addDays(today, -700), 61200, 698, 38, 33);

const truck = await vehicle({ name: "Big Blue", year: 2011, make: "Ford", model: "F-150", color: "rust", tankCapacity: "26", sortOrder: 1 });
const truckMiles = await drive(truck.id, addDays(today, -500), 142300, 480, 14, 16);

const tractor = await vehicle({ name: "Kubota", year: 2019, make: "Kubota", model: "BX2380", color: "olive", meterType: "HOURS", readingPrecision: "TENTHS", fuelUnit: "GAL_US", sortOrder: 2 });
const hourRows: (typeof entries.$inferInsert)[] = [];
let hours = 212 * 60;
for (let d = -300; d <= -2; d += 6 + Math.floor(rand() * 10)) {
  hours += Math.round((1 + rand() * 3) * 60);
  hourRows.push({ vehicleId: tractor.id, categoryId: code("P"), occurredOn: iso(addDays(today, d)), readingTicks: hours, description: ["Mowing", "Snow", "Moving gravel", "Brush hog"][Math.floor(rand() * 4)] });
}
await db.insert(entries).values(hourRows);

await db.insert(serviceReminders).values([
  { vehicleId: civic.id, description: "Oil & filter", dueMode: "EITHER", dueReadingTicks: (civicMiles + 240) * 100, dueOn: iso(addDays(today, 70)), intervalTicks: 500000, intervalMonths: 6, templateKey: "oil" },
  { vehicleId: civic.id, description: "Tire rotation", dueMode: "EITHER", dueReadingTicks: (civicMiles + 2600) * 100, dueOn: iso(addDays(today, 120)), intervalTicks: 600000, intervalMonths: 6, templateKey: "tire-rotation" },
  { vehicleId: civic.id, description: "Wiper blades", dueMode: "DATE", dueOn: iso(addDays(today, -9)), intervalMonths: 12, templateKey: "wipers" },
  { vehicleId: truck.id, description: "Oil & filter", dueMode: "EITHER", dueReadingTicks: (truckMiles - 120) * 100, dueOn: iso(addDays(today, 40)), intervalTicks: 500000, intervalMonths: 6, templateKey: "oil" },
  { vehicleId: tractor.id, description: "Grease fittings", dueMode: "READING", dueReadingTicks: hours + 4 * 60, intervalTicks: 600, templateKey: "h-grease" },
  { vehicleId: tractor.id, description: "Engine oil & filter", dueMode: "EITHER", dueReadingTicks: hours + 60 * 60, dueOn: iso(addDays(today, 200)), intervalTicks: 6000, intervalMonths: 12, templateKey: "h-engine-oil" },
]);

await db.insert(vehicleDocuments).values([
  { vehicleId: civic.id, kind: "INSURANCE", title: "Auto policy", provider: "State Farm", startsOn: iso(addDays(today, -165)), expiresOn: iso(addDays(today, 18)), renewEveryMonths: 6, cost: "612.40" },
  { vehicleId: civic.id, kind: "REGISTRATION", title: "Registration", provider: "PennDOT", startsOn: iso(addDays(today, -200)), expiresOn: iso(addDays(today, 165)), renewEveryMonths: 12, cost: "45.00" },
  { vehicleId: truck.id, kind: "INSPECTION", title: "State inspection", provider: "Dave's Garage", startsOn: iso(addDays(today, -330)), expiresOn: iso(addDays(today, 35)), renewEveryMonths: 12, cost: "39.95" },
]);

console.log(`seeded: ${civic.name}, ${truck.name}, ${tractor.name}`);
process.exit(0);
