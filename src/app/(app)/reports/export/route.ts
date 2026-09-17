import { listVehicles, loadLog, unitsOf } from "@/lib/data";
import { getSessionUser } from "@/lib/auth";
import { resolveRange } from "@/lib/reports";
import { formatReading, ticksToUnits, unitLabel } from "@/lib/units";

export const dynamic = "force-dynamic";

/**
 * Itemised CSV — the supporting schedule for the report.
 *
 * Query params:
 *   vehicle=<id> | vehicle=all      One vehicle (default: the first) or all
 *   range=last-month                Previous calendar month; overrides year
 *   year=YYYY                       Whole calendar year (default: current)
 *   from=YYYY-MM-DD, to=YYYY-MM-DD  Explicit range; wins over range and year
 *
 * The Vehicle and Units columns are always present, even for a single-vehicle
 * export: a spreadsheet with hours and miles in the same column would tell
 * quiet lies, and a leading Vehicle column keeps a mixed CSV honest.
 */
export async function GET(req: Request) {
  if (!(await getSessionUser())) return new Response("Not signed in.", { status: 401 });

  const url = new URL(req.url);
  const vehicleParam = url.searchParams.get("vehicle");
  const period = resolveRange({
    range: url.searchParams.get("range"),
    year: url.searchParams.get("year"),
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
  });

  const all = await listVehicles();
  if (all.length === 0) return new Response("No vehicles.", { status: 404 });

  const chosen =
    vehicleParam === "all"
      ? all
      : [all.find((v) => v.id === vehicleParam) ?? all[0]!];

  const header = [
    "Vehicle", "Units",
    "Date", "Reading", "Distance", "Category", "Business", "Description",
    "Price per unit", "Quantity", "Cost", "Needs review",
  ];

  const body: string[][] = [];
  for (const vehicle of chosen) {
    const units = unitsOf(vehicle);
    const rows = (await loadLog(vehicle.id)).filter(
      (e) => e.occurredOn >= period.from && e.occurredOn <= period.to,
    );
    for (const e of rows) {
      body.push([
        vehicle.name,
        unitLabel(units),
        e.occurredOn,
        e.readingTicks === null ? "" : formatReading(e.readingTicks, units, { grouped: false }),
        e.distanceTicks === null ? "" : String(ticksToUnits(e.distanceTicks, units)),
        e.category?.name ?? "",
        e.category?.isBusiness ? "yes" : "no",
        e.description ?? "",
        e.fuelPricePerUnit === null ? "" : String(e.fuelPricePerUnit),
        e.fuelQty === null ? "" : String(e.fuelQty),
        e.cost === null ? "" : String(e.cost),
        e.needsReview ? "yes" : "",
      ]);
    }
  }

  const csv = [header, ...body]
    .map((r) => r.map((cell) => escapeCsv(String(cell))).join(","))
    .join("\r\n");

  const stem = chosen.length === 1 ? slug(chosen[0]!.name) : "logbook";
  const filename = `${stem}-${period.suffix}.csv`;

  return new Response(`﻿${csv}`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}

/** Quote anything with a separator, quote or newline; double inner quotes. */
function escapeCsv(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "vehicle";
}
