import { notFound } from "next/navigation";
import { inArray } from "drizzle-orm";
import { type BoardDocument, DocumentBoard } from "@/components/maintenance/DocumentBoard";
import { db } from "@/db";
import { entryAttachments } from "@/db/schema";
import { getVehicle, latestReadingTicks, loadDocuments, todayIso, unitsOf } from "@/lib/data";
import { documentStatus } from "@/lib/maintenance";
import { formatReading } from "@/lib/units";

export const dynamic = "force-dynamic";

export default async function DocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const vehicle = await getVehicle(id);
  if (!vehicle) notFound();
  const units = unitsOf(vehicle);
  const today = todayIso();

  const [docs, current] = await Promise.all([loadDocuments(id, true), latestReadingTicks(id)]);
  const files = docs.length
    ? await db.select().from(entryAttachments).where(inArray(entryAttachments.documentId, docs.map((d) => d.id)))
    : [];

  const board: BoardDocument[] = docs
    .map((d) => ({
      id: d.id,
      kind: d.kind,
      title: d.title,
      provider: d.provider ?? "",
      reference: d.reference ?? "",
      startsOn: d.startsOn ?? "",
      expiresOn: d.expiresOn ?? "",
      expiresAtReading: d.expiresAtReadingTicks === null ? "" : formatReading(d.expiresAtReadingTicks, units, { grouped: false }),
      expiresAtReadingTicks: d.expiresAtReadingTicks,
      renewEveryMonths: d.renewEveryMonths?.toString() ?? "",
      cost: d.cost === null ? null : Number(d.cost),
      notes: d.notes ?? "",
      isArchived: d.isArchived,
      status: documentStatus(d, current, today, units),
      attachments: files.filter((f) => f.documentId === d.id).map((f) => ({ id: f.id, filename: f.filename, mime: f.mime })),
    }))
    // Soonest expiry first; no expiry last; past periods newest first.
    .sort((a, b) =>
      a.isArchived !== b.isArchived
        ? Number(a.isArchived) - Number(b.isArchived)
        : a.isArchived
          ? b.startsOn.localeCompare(a.startsOn)
          : (a.expiresOn || "9999").localeCompare(b.expiresOn || "9999"),
    );

  return (
    <main className="mx-auto max-w-[1400px] px-4 pb-12 pt-6 sm:px-8">
      <div className="max-w-3xl">
        <DocumentBoard vehicleId={id} units={units} today={today} documents={board} />
      </div>
    </main>
  );
}
