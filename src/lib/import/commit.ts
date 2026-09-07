import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { categories, entries, importBatches, serviceReminders } from "@/db/schema";
import type { ImportPlan, ResolvedRow } from "./plan";

export interface CommitInput {
  vehicleId: string;
  filename: string;
  userId: string | null;
  plan: ImportPlan;
  rows: ResolvedRow[];
  reminders?: { description: string; dueReadingTicks: number | null; dueOn: string | null; intervalTicks: number | null }[];
}

export interface CommitResult {
  batchId: string;
  imported: number;
  skipped: number;
  corrected: number;
  flagged: number;
  remindersCreated: number;
}

/**
 * Write a reviewed import.
 *
 * The whole batch shares one import_batches row, which is what makes it
 * reversible as a unit. Every corrected row keeps the value it arrived with,
 * so a correction is never destructive.
 */
export async function commitImport(input: CommitInput): Promise<CommitResult> {
  const { vehicleId, filename, userId, rows } = input;

  const cats = await db.select().from(categories);
  const byCode = new Map<string, string>();
  for (const c of cats) {
    if (c.vehicleId === null || c.vehicleId === vehicleId) byCode.set(c.code, c.id);
  }

  // Keep anything carrying real content. An earlier version required a date
  // or a reading, which silently dropped a genuine $33.47 fill-up that had
  // neither but did have its gallons and price. Truly empty rows were
  // already removed when the sheet was read.
  const keep = rows.filter(
    (r) =>
      !r.skip &&
      (r.occurredOn !== null ||
        r.readingTicks !== null ||
        r.description !== null ||
        r.fuelQty !== null ||
        r.cost !== null),
  );

  return db.transaction(async (tx) => {
    const batch = (
      await tx
        .insert(importBatches)
        .values({
          vehicleId,
          filename,
          status: "COMMITTED",
          createdBy: userId,
          committedAt: new Date(),
          stats: {
            rowsRead: input.plan.stats.rowsRead,
            blankRowsDropped: input.plan.stats.blankRowsDropped,
            duplicatesAcrossSheets: input.plan.stats.duplicatesAcrossSheets,
            imported: keep.length,
            skipped: rows.length - keep.length,
          },
        })
        .returning({ id: importBatches.id })
    )[0]!;

    const values = keep.map((r) => {
      // A reading with no date has no place in a time-ordered chain. Parking
      // it on January 1st fabricated an 11,498-mile jump in the real file and
      // pushed fuel economy to 790 mpg. The row still imports — description,
      // category, everything — but its reading is held back until someone
      // supplies a date, and the original is preserved verbatim.
      const undated = r.occurredOn === null;
      const heldBack = undated && r.readingTicks !== null;
      return {
      vehicleId,
      categoryId: r.categoryCode ? (byCode.get(r.categoryCode) ?? null) : null,
      occurredOn: r.occurredOn ?? `${sheetYear(r.sheet)}-01-01`,
      readingTicks: undated ? null : r.readingTicks,
      description: r.description,
      fuelQty: r.fuelQty === null ? null : String(r.fuelQty),
      fuelPricePerUnit: r.pricePerUnit === null ? null : String(r.pricePerUnit),
      cost: r.cost === null ? null : String(r.cost),
      importBatchId: batch.id,
      importRowRef: r.ref,
      importOriginalValue: heldBack
        ? `reading ${r.readingTicks} held back — no date in the source row`
        : r.originalNote,
      needsReview: r.needsReview || undated,
      reviewReason: undated
        ? heldBack
          ? "No date in the source row, so its reading is held out of the mileage chain. Add a date to restore it."
          : "No date in the source row."
        : r.reviewReason,
      createdBy: userId,
      };
    });

    // Chunked: a single 3,300-row insert exceeds the parameter limit.
    for (let i = 0; i < values.length; i += 500) {
      await tx.insert(entries).values(values.slice(i, i + 500));
    }

    let remindersCreated = 0;
    for (const r of input.reminders ?? []) {
      await tx.insert(serviceReminders).values({
        vehicleId,
        description: r.description,
        dueReadingTicks: r.dueReadingTicks,
        dueOn: r.dueOn,
        intervalTicks: r.intervalTicks,
      });
      remindersCreated++;
    }

    return {
      batchId: batch.id,
      imported: keep.length,
      skipped: rows.length - keep.length,
      corrected: keep.filter((r) => r.originalNote !== null).length,
      flagged: keep.filter((r) => r.needsReview).length,
      remindersCreated,
    };
  });
}

/** Undo a whole batch. */
export async function revertImport(batchId: string): Promise<number> {
  return db.transaction(async (tx) => {
    const removed = await tx.delete(entries).where(eq(entries.importBatchId, batchId)).returning({ id: entries.id });
    await tx
      .update(importBatches)
      .set({ status: "REVERTED", revertedAt: new Date() })
      .where(eq(importBatches.id, batchId));
    return removed.length;
  });
}

function sheetYear(sheet: string): string {
  return /^(19|20)\d{2}$/.test(sheet.trim()) ? sheet.trim() : String(new Date().getFullYear());
}
