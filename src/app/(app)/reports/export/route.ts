import { listVehicles, loadDocuments, loadLog, unitsOf } from "@/lib/data";
import { documentCostDay } from "@/lib/costs";
import { DOCUMENT_KIND_LABEL } from "@/lib/maintenance";
import { getSessionUser } from "@/lib/auth";
import { formatReading, ticksToUnits } from "@/lib/units";

export const dynamic = "force-dynamic";

/** Itemised CSV for the selected year — the supporting schedule for the report. */
export async function GET(req: Request) {
  if (!(await getSessionUser())) return new Response("Not signed in.", { status: 401 });

  const url = new URL(req.url);
  const year = url.searchParams.get("year") ?? String(new Date().getFullYear());
  const vehicleId = url.searchParams.get("vehicle");

  const all = await listVehicles();
  const vehicle = all.find((v) => v.id === vehicleId) ?? all[0];
  if (!vehicle) return new Response("No vehicle.", { status: 404 });

  const units = unitsOf(vehicle);
  const rows = (await loadLog(vehicle.id)).filter((e) => e.occurredOn.startsWith(year));

  const header = [
    "Date", "Reading", "Distance", "Category", "Business", "Description",
    "Vendor", "Price per unit", "Quantity", "Cost", "Needs review",
  ];
  const body = rows.map((e) => [
    e.occurredOn,
    e.readingTicks === null ? "" : formatReading(e.readingTicks, units, { grouped: false }),
    e.distanceTicks === null ? "" : String(ticksToUnits(e.distanceTicks, units)),
    e.category?.name ?? "",
    e.category?.isBusiness ? "yes" : "no",
    e.description ?? "",
    e.vendor ?? "",
    e.fuelPricePerUnit ?? "",
    e.fuelQty ?? "",
    e.cost ?? "",
    e.needsReview ? "yes" : "",
  ]);

  // Fees (registration, insurance…) from documents, on the day their period starts.
  const fees = (await loadDocuments(vehicle.id, true))
    .filter((d) => d.cost !== null)
    .map((d) => ({ d, day: documentCostDay({ startsOn: d.startsOn, expiresOn: d.expiresOn, createdOn: d.createdAt.toISOString().slice(0, 10), cost: null }) }))
    .filter(({ day }) => day.startsWith(year))
    .map(({ d, day }) => [day, "", "", `Fee: ${DOCUMENT_KIND_LABEL[d.kind]}`, "no", d.title, d.provider ?? "", "", "", d.cost ?? "", ""]);

  const csv = [header, ...[...body, ...fees].sort((a, b) => String(a[0]).localeCompare(String(b[0])))]
    .map((r) => r.map((cell) => escapeCsv(String(cell))).join(","))
    .join("\r\n");

  return new Response(`﻿${csv}`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${slug(vehicle.name)}-${year}.csv"`,
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
