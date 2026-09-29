"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { vehicleDocuments } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getVehicle, unitsOf } from "@/lib/data";
import { type DocumentKind, DOCUMENT_KIND_LABEL, addMonthsIso } from "@/lib/maintenance";
import { ReadingParseError, parseReading } from "@/lib/units";

export interface DocumentState {
  error?: string;
  ok?: number;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function saveDocument(_prev: DocumentState, form: FormData): Promise<DocumentState> {
  await requireUser();
  const vehicleId = text(form, "vehicleId");
  const vehicle = await getVehicle(vehicleId);
  if (!vehicle) return { error: "Vehicle not found." };

  const kind = text(form, "kind") as DocumentKind;
  if (!(kind in DOCUMENT_KIND_LABEL)) return { error: "Choose what kind of document this is." };
  const title = text(form, "title") || DOCUMENT_KIND_LABEL[kind];

  const startsOn = text(form, "startsOn") || null;
  const expiresOn = text(form, "expiresOn") || null;
  if ((startsOn && !ISO.test(startsOn)) || (expiresOn && !ISO.test(expiresOn))) return { error: "Dates must be yyyy-mm-dd." };
  if (startsOn && expiresOn && expiresOn < startsOn) return { error: "It cannot expire before it starts." };

  const renewRaw = text(form, "renewEveryMonths");
  const renewEveryMonths = renewRaw === "" ? null : Number.parseInt(renewRaw, 10);
  if (renewEveryMonths !== null && !(renewEveryMonths > 0)) return { error: "Renewal must be a whole number of months." };

  const costRaw = text(form, "cost").replace(/[$,\s]/g, "");
  const cost = costRaw === "" ? null : Number(costRaw);
  if (cost !== null && !Number.isFinite(cost)) return { error: "That cost is not a number." };

  let expiresAtReadingTicks: number | null = null;
  const readingRaw = text(form, "expiresAtReading");
  if (readingRaw) {
    try {
      expiresAtReadingTicks = parseReading(readingRaw, unitsOf(vehicle));
    } catch (e) {
      return { error: e instanceof ReadingParseError ? e.message : "That reading is not valid." };
    }
  }

  const values = {
    kind,
    title,
    provider: text(form, "provider") || null,
    reference: text(form, "reference") || null,
    startsOn,
    expiresOn,
    expiresAtReadingTicks,
    renewEveryMonths,
    cost: cost === null ? null : cost.toFixed(2),
    notes: text(form, "notes") || null,
  };

  const id = text(form, "id");
  let docId = id;
  if (id) {
    await db
      .update(vehicleDocuments)
      .set({ ...values, updatedAt: new Date() })
      .where(and(eq(vehicleDocuments.id, id), eq(vehicleDocuments.vehicleId, vehicleId)));
  } else {
    docId = (await db.insert(vehicleDocuments).values({ vehicleId, ...values }).returning({ id: vehicleDocuments.id }))[0]!.id;
  }

  const file = form.get("file");
  if (file instanceof File && file.size > 0) {
    const { saveUpload } = await import("@/lib/uploads");
    const saved = await saveUpload(file, { documentId: docId });
    if ("error" in saved) return { error: `Saved, but the file was not: ${saved.error}` };
  }

  revalidatePath("/", "layout");
  return { ok: Date.now() };
}

/**
 * Renewal starts a new period: the old one is kept (archived) so each
 * period's cost stays where it was paid.
 */
export async function renewDocument(_prev: DocumentState, form: FormData): Promise<DocumentState> {
  await requireUser();
  const old = (await db.select().from(vehicleDocuments).where(eq(vehicleDocuments.id, text(form, "id"))).limit(1))[0];
  if (!old) return { error: "That document no longer exists." };

  const startsOn = text(form, "startsOn") || old.expiresOn;
  const expiresOn =
    text(form, "expiresOn") || (startsOn && old.renewEveryMonths ? addMonthsIso(startsOn, old.renewEveryMonths) : null);
  if (!startsOn || !ISO.test(startsOn) || (expiresOn && !ISO.test(expiresOn))) return { error: "Give the new period's dates." };
  const costRaw = text(form, "cost").replace(/[$,\s]/g, "");
  const cost = costRaw === "" ? null : Number(costRaw);
  if (cost !== null && !Number.isFinite(cost)) return { error: "That cost is not a number." };

  await db.transaction(async (tx) => {
    await tx.update(vehicleDocuments).set({ isArchived: true, updatedAt: new Date() }).where(eq(vehicleDocuments.id, old.id));
    await tx.insert(vehicleDocuments).values({
      vehicleId: old.vehicleId,
      kind: old.kind,
      title: old.title,
      provider: old.provider,
      reference: text(form, "reference") || old.reference,
      startsOn,
      expiresOn,
      expiresAtReadingTicks: old.expiresAtReadingTicks,
      renewEveryMonths: old.renewEveryMonths,
      cost: cost === null ? null : cost.toFixed(2),
      notes: old.notes,
    });
  });
  revalidatePath("/", "layout");
  return { ok: Date.now() };
}

export async function deleteDocument(form: FormData): Promise<void> {
  await requireUser();
  const { removeFilesFor } = await import("@/lib/uploads");
  const id = text(form, "id");
  await removeFilesFor({ documentId: id });
  await db.delete(vehicleDocuments).where(eq(vehicleDocuments.id, id));
  revalidatePath("/", "layout");
}
