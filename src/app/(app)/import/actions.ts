"use server";

import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { importBatches } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { assertSameOrigin } from "@/lib/http";
import { getVehicle, listCategories, unitsOf } from "@/lib/data";
import { commitImport, revertImport } from "@/lib/import/commit";
import { type ParsedDocument, autoMap, detectShape } from "@/lib/import/mapping";
import { ParseError, parseUpload } from "@/lib/import/parse";
import { type Decision, buildPlan, resolve } from "@/lib/import/plan";
import { ticksPerUnit } from "@/lib/units";

export interface UploadState {
  error?: string;
}

export async function uploadFile(_prev: UploadState, form: FormData): Promise<UploadState> {
  const user = await requireUser();
  await assertSameOrigin();
  const file = form.get("file");
  const vehicleId = String(form.get("vehicleId") ?? "");

  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file to upload." };
  if (!vehicleId) return { error: "Choose which vehicle this belongs to." };

  let doc: ParsedDocument;
  try {
    doc = await parseUpload(file);
  } catch (e) {
    return { error: e instanceof ParseError ? e.message : "That file could not be read." };
  }

  const shape = detectShape(doc);
  if (shape.logTables.length === 0) {
    return { error: "No table in that file looks like a mileage log — nothing with both a date and a reading column." };
  }

  const batch = (
    await db
      .insert(importBatches)
      .values({
        vehicleId,
        filename: file.name,
        status: "DRAFT",
        createdBy: user.id,
        draftDocument: doc as unknown as object,
        draftDecisions: [],
      })
      .returning({ id: importBatches.id })
  )[0]!;

  redirect(`/import/${batch.id}`);
}

/** Rebuild the plan from the stored draft. Pure, so it is always in step. */
export async function loadDraft(batchId: string) {
  await requireUser();
  const rows = await db.select().from(importBatches).where(eq(importBatches.id, batchId)).limit(1);
  const batch = rows[0];
  if (!batch || batch.status !== "DRAFT" || !batch.draftDocument) return null;

  const doc = batch.draftDocument as unknown as ParsedDocument;
  const vehicle = batch.vehicleId ? await getVehicle(batch.vehicleId) : null;
  if (!vehicle) return null;

  const cats = await listCategories(vehicle.id);
  const shape = detectShape(doc);
  const plan = buildPlan(doc, {
    tables: shape.logTables.map((t) => ({ sheet: t.sheet, table: t.table })),
    ticksPerUnit: ticksPerUnit(unitsOf(vehicle)),
    tankCapacity: vehicle.tankCapacity ? Number(vehicle.tankCapacity) : null,
    knownCategoryCodes: new Set(cats.map((c) => c.code)),
    fuelCategoryCodes: new Set(cats.filter((c) => c.kind === "FUEL").map((c) => c.code)),
    minYear: 2000,
    maxYear: new Date().getFullYear() + 1,
  });

  return {
    batch,
    doc,
    vehicle,
    shape,
    plan,
    decisions: (batch.draftDecisions ?? []) as Decision[],
    mapping: shape.logTables[0]
      ? autoMap(
          doc.sheets
            .find((s) => s.name === shape.logTables[0]!.sheet)!
            .tables.find((t) => t.name === shape.logTables[0]!.table)!.headers,
        )
      : null,
  };
}

export async function saveDecision(batchId: string, decision: Decision): Promise<void> {
  await requireUser();
  await assertSameOrigin();
  const rows = await db.select().from(importBatches).where(eq(importBatches.id, batchId)).limit(1);
  const batch = rows[0];
  if (!batch || batch.status !== "DRAFT") return;

  const existing = ((batch.draftDecisions ?? []) as Decision[]).filter(
    (d) => !(d.rowRef === decision.rowRef && d.field === decision.field),
  );
  existing.push(decision);

  await db
    .update(importBatches)
    .set({ draftDecisions: existing as unknown as object })
    .where(eq(importBatches.id, batchId));
  revalidatePath(`/import/${batchId}`);
}

export async function acceptAllSuggested(batchId: string): Promise<void> {
  const draft = await loadDraft(batchId);
  if (!draft) return;

  // Only the unambiguous ones. Where several edits fit, the user chooses.
  const decisions: Decision[] = draft.plan.findings
    .filter((f) => f.defaultAction === "CORRECT" && f.suggestions.length === 1)
    .map((f) => ({ rowRef: f.rowRef, field: f.field, action: "CORRECT", value: f.suggestions[0]!.value }));

  const merged = [...(draft.decisions as Decision[])];
  for (const d of decisions) {
    if (!merged.some((m) => m.rowRef === d.rowRef && m.field === d.field)) merged.push(d);
  }
  await db
    .update(importBatches)
    .set({ draftDecisions: merged as unknown as object })
    .where(eq(importBatches.id, batchId));
  revalidatePath(`/import/${batchId}`);
}

export async function commitDraft(form: FormData): Promise<void> {
  const user = await requireUser();
  await assertSameOrigin();
  const batchId = String(form.get("batchId") ?? "");
  const draft = await loadDraft(batchId);
  if (!draft) return;

  const rows = resolve(draft.plan, draft.decisions);
  await commitImport({
    vehicleId: draft.vehicle.id,
    filename: draft.batch.filename,
    userId: user.id,
    plan: draft.plan,
    rows,
    reminders: remindersFrom(draft.doc),
  });

  // The draft batch is superseded by the committed one.
  await db.delete(importBatches).where(eq(importBatches.id, batchId));
  revalidatePath("/");
  redirect(`/vehicles/${draft.vehicle.id}/entries`);
}

export async function discardDraft(form: FormData): Promise<void> {
  await requireUser();
  await assertSameOrigin();
  const batchId = String(form.get("batchId") ?? "");
  await db
    .delete(importBatches)
    .where(and(eq(importBatches.id, batchId), eq(importBatches.status, "DRAFT")));
  redirect("/import");
}

export async function undoImport(form: FormData): Promise<void> {
  await requireUser();
  await assertSameOrigin();
  const batchId = String(form.get("batchId") ?? "");
  await revertImport(batchId);
  revalidatePath("/import");
  revalidatePath("/");
}

export async function listBatches() {
  await requireUser();
  return db
    .select()
    .from(importBatches)
    .where(eq(importBatches.status, "COMMITTED"))
    .orderBy(desc(importBatches.committedAt))
    .limit(20);
}

/** Side tables named like notes become reminders — but only future ones. */
function remindersFrom(doc: ParsedDocument) {
  const out: { description: string; dueReadingTicks: number | null; dueOn: string | null; intervalTicks: number | null }[] = [];
  for (const sheet of doc.sheets) {
    for (const t of sheet.tables) {
      if (!/note|reminder|due/i.test(t.name)) continue;
      const dateCol = t.headers.findIndex((h) => /date/i.test(h));
      const readCol = t.headers.findIndex((h) => /milage|mileage|odom|hour/i.test(h));
      const descCol = t.headers.findIndex((h) => /desc/i.test(h));
      for (const row of t.rows) {
        const desc = descCol >= 0 ? row[descCol] : null;
        if (typeof desc !== "string" || desc.trim() === "") continue;
        // "LAST SERVICE: ..." records work already done.
        if (/^\s*last\b/i.test(desc)) continue;
        const reading = readCol >= 0 && typeof row[readCol] === "number" ? Math.round((row[readCol] as number) * 100) : null;
        const on = dateCol >= 0 && typeof row[dateCol] === "string" ? (row[dateCol] as string).slice(0, 10) : null;
        out.push({
          description: desc.trim(),
          dueReadingTicks: reading,
          dueOn: on,
          intervalTicks: /every\s*5\s*k/i.test(desc) ? 500000 : null,
        });
      }
    }
  }
  return out;
}
