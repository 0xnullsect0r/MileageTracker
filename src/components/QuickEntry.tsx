"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { type EntryState, deleteEntry, removeEntryAttachment, saveEntry } from "@/app/(app)/vehicles/[id]/entries/actions";
import { AttachmentInput, AttachmentList, type AttachmentView } from "@/components/Attachments";
import { Button, Field, Label, Rule, inputClass } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  type VehicleUnits,
  ReadingParseError,
  formatDelta,
  formatReading,
  parseReading,
  readingInputProps,
  unitLabel,
} from "@/lib/units";

export interface QuickCategory {
  id: string;
  code: string;
  name: string;
  kind: "TRIP" | "FUEL" | "SERVICE" | "NOTE";
}

export interface OpenReminder {
  id: string;
  description: string;
  /** Due, overdue or coming up: pre-ticked on a service entry. */
  suggested: boolean;
  statusText: string;
}

export interface PartRow {
  name: string;
  partNumber: string;
  qty: string;
  unitCost: string;
}

export interface EntryDefaults {
  id: string;
  occurredOn: string;
  reading: string;
  categoryId: string;
  description: string;
  pricePerUnit: string;
  fuelQty: string;
  cost: string;
  isPartialFill: boolean;
  odometerReset: boolean;
  vendor: string;
  notes: string;
  parts: PartRow[];
  attachments: AttachmentView[];
  /** Reminders this entry already took care of. */
  completed: string[];
  reviewReason: string | null;
}

const BLANK_PART: PartRow = { name: "", partNumber: "", qty: "", unitCost: "" };

export function QuickEntry({
  vehicleId,
  vehicleName,
  units,
  categories,
  lastReadingTicks,
  today,
  reminders = [],
  entry,
}: {
  vehicleId: string;
  vehicleName: string;
  units: VehicleUnits;
  categories: QuickCategory[];
  /** The reading this entry is checked against: the latest, or for an edit, the one before it. */
  lastReadingTicks: number | null;
  today: string;
  reminders?: OpenReminder[];
  entry?: EntryDefaults;
}) {
  const [state, action, pending] = useActionState<EntryState, FormData>(saveEntry, {});
  const [reading, setReading] = useState(entry?.reading ?? "");
  const [categoryId, setCategoryId] = useState(
    entry?.categoryId || categories.find((c) => c.code === "P")?.id || categories[0]?.id || "",
  );
  const [parts, setParts] = useState<PartRow[]>(entry?.parts.length ? entry.parts : []);
  const [deleting, startDelete] = useTransition();

  const kind = categories.find((c) => c.id === categoryId)?.kind ?? "TRIP";
  const isFuel = kind === "FUEL";
  const isService = kind === "SERVICE";

  const last = lastReadingTicks === null ? null : formatReading(lastReadingTicks, units, { grouped: false });

  // The live check that catches a fat finger at the pump, before the tap.
  const delta = useMemo(() => {
    if (reading.trim() === "" || lastReadingTicks === null) return null;
    try {
      const ticks = parseReading(reading, units);
      return ticks - lastReadingTicks;
    } catch (e) {
      return e instanceof ReadingParseError ? e : null;
    }
  }, [reading, lastReadingTicks, units]);

  const props = readingInputProps(units);
  const partsTotal = parts.reduce((a, p) => a + (Number(p.unitCost) || 0) * (Number(p.qty) || 1), 0);
  const setPart = (i: number, k: keyof PartRow, v: string) =>
    setParts((prev) => prev.map((p, j) => (j === i ? { ...p, [k]: v } : p)));

  return (
    <div className="mx-auto w-full max-w-md">
      <form action={action}>
        <input type="hidden" name="vehicleId" value={vehicleId} />
        <input type="hidden" name="categoryId" value={categoryId} />
        {entry && <input type="hidden" name="id" value={entry.id} />}

        <Label>{entry ? `Editing · ${vehicleName}` : vehicleName}</Label>
        {entry?.reviewReason && (
          <p className="mt-2 border-l-[3px] border-signal pl-3 text-sm">
            Flagged on import: {entry.reviewReason} Saving clears the flag.
          </p>
        )}

        <div className="mt-3">
          <label htmlFor="reading" className="block text-[0.75rem] font-semibold uppercase tracking-[0.06em] text-ink-muted">
            Reading
          </label>
          <input
            id="reading"
            name="reading"
            value={reading}
            onChange={(e) => setReading(e.target.value)}
            inputMode={props.inputMode}
            step={props.step}
            {...(props.pattern ? { pattern: props.pattern } : {})}
            autoFocus={!entry}
            autoComplete="off"
            // Large, mono, and prefilled by placeholder with the last reading —
            // so you key the two or three digits that changed, not all six.
            className="num mt-1 w-full border-0 border-b-2 border-rule bg-transparent px-0 py-2 text-[2.5rem] leading-tight tracking-tight text-ink focus:border-signal focus:outline-none"
            placeholder={last ?? props.placeholder}
          />
          <div className="mt-2 min-h-6 text-sm">
            {delta instanceof ReadingParseError ? (
              <span className="font-semibold" style={{ color: "var(--signal)" }}>{delta.message}</span>
            ) : delta !== null ? (
              <span className={cn("num", delta < 0 && "font-semibold")} style={delta < 0 ? { color: "var(--signal)" } : undefined}>
                <span className="computed px-1">{formatDelta(delta, units)}</span>
                {delta < 0 && ` — lower than the ${entry ? "previous" : "last"} reading`}
              </span>
            ) : last ? (
              <span className="text-ink-muted">
                {entry ? "Previous" : "Last"} was <span className="num">{formatReading(lastReadingTicks!, units)}</span> {unitLabel(units)}
              </span>
            ) : null}
          </div>
        </div>

        <div className="mt-6">
          <Label>Category</Label>
          <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-5">
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategoryId(c.id)}
                aria-pressed={c.id === categoryId}
                title={c.name}
                className={cn(
                  "min-h-12 border text-sm font-semibold transition-colors duration-100",
                  c.id === categoryId
                    ? "border-ink bg-ink text-paper"
                    : "border-rule text-ink-muted hover:border-ink hover:text-ink",
                )}
              >
                <span className="num">{c.code}</span>
                <span className="sr-only"> {c.name}</span>
              </button>
            ))}
          </div>
          <p className="mt-1 text-sm text-ink-muted">
            {categories.find((c) => c.id === categoryId)?.name}
          </p>
        </div>

        <div className="mt-6 grid gap-6">
          <Field label="Description">
            <input
              className={inputClass}
              name="description"
              autoComplete="off"
              defaultValue={entry?.description}
              placeholder={isService ? "Oil change" : isFuel ? "Shell" : "Errands"}
            />
          </Field>
          <Field label="Date">
            <input className={inputClass} type="date" name="occurredOn" defaultValue={entry?.occurredOn ?? today} required />
          </Field>
        </div>

        {/* Fuel and service fields appear inline for their category — not a
            modal, not a second step. */}
        {(isFuel || isService) && (
          <>
            <Rule className="mt-8" />
            <div className="mt-6 grid gap-6">
              {isFuel && (
                <div className="grid grid-cols-2 gap-4">
                  <Field label={`$ / ${unitLabel(units) === "h" ? "unit" : "gal"}`}>
                    <input className={inputClass} name="pricePerUnit" inputMode="decimal" defaultValue={entry?.pricePerUnit} placeholder="3.279" />
                  </Field>
                  <Field label="Quantity">
                    <input className={inputClass} name="fuelQty" inputMode="decimal" defaultValue={entry?.fuelQty} placeholder="12.4" />
                  </Field>
                </div>
              )}
              {isService && (
                <Field label="Shop">
                  <input className={inputClass} name="vendor" defaultValue={entry?.vendor} placeholder="Valvoline" autoComplete="organization" />
                </Field>
              )}
              <Field
                label="Cost"
                hint={
                  isFuel
                    ? "Leave blank and it is worked out from price × quantity."
                    : parts.length > 0
                      ? `Leave blank to use the parts total${partsTotal > 0 ? ` ($${partsTotal.toFixed(2)})` : ""}.`
                      : undefined
                }
              >
                <input className={inputClass} name="cost" inputMode="decimal" defaultValue={entry?.cost} placeholder={isService && partsTotal > 0 ? partsTotal.toFixed(2) : "40.06"} />
              </Field>
              {isFuel && (
                <label className="flex min-h-11 items-center gap-3 text-sm">
                  <input type="checkbox" name="isPartialFill" defaultChecked={entry?.isPartialFill} className="size-5 accent-[var(--signal)]" />
                  Partial fill — did not fill the tank
                </label>
              )}
            </div>
          </>
        )}

        {isService && (
          <>
            {(reminders.length > 0 || (entry?.completed.length ?? 0) > 0) && (
              <fieldset className="mt-8">
                <legend className="text-[0.75rem] font-semibold uppercase tracking-[0.06em] text-ink-muted">This took care of</legend>
                <ul className="mt-2 border-t border-rule">
                  {entry?.completed.map((name) => (
                    <li key={name} className="flex min-h-11 items-center gap-3 border-b border-rule text-sm text-ink-muted">
                      <span className="inline-flex size-5 items-center justify-center">✓</span>
                      {name}
                    </li>
                  ))}
                  {reminders.map((r) => (
                    <li key={r.id} className="border-b border-rule">
                      <label className="flex min-h-12 items-center gap-3 text-sm">
                        <input type="checkbox" name="reminderId" value={r.id} defaultChecked={!entry && r.suggested} className="size-5 accent-[var(--signal)]" />
                        <span className="flex-1">{r.description}</span>
                        <span className={cn("num text-[0.8125rem]", r.suggested ? "text-signal" : "text-ink-muted")}>{r.statusText}</span>
                      </label>
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-sm text-ink-muted">Each ticked reminder restarts from this entry&rsquo;s date and reading.</p>
              </fieldset>
            )}

            <div className="mt-8">
              <Label>Parts</Label>
              {parts.map((p, i) => (
                <div key={i} className="mt-3 grid grid-cols-[1fr_4.5rem] gap-x-3 gap-y-2 border-b border-rule pb-3">
                  <input className={inputClass} name="partName" value={p.name} onChange={(e) => setPart(i, "name", e.target.value)} placeholder="Oil filter" aria-label={`Part ${i + 1} name`} />
                  <button type="button" className="min-h-11 text-sm text-ink-muted hover:text-signal" onClick={() => setParts((prev) => prev.filter((_, j) => j !== i))}>
                    Remove
                  </button>
                  <div className="col-span-2 grid grid-cols-[1fr_4rem_5.5rem] gap-3">
                    <input className={cn(inputClass, "num")} name="partNumber" value={p.partNumber} onChange={(e) => setPart(i, "partNumber", e.target.value)} placeholder="Part no." aria-label={`Part ${i + 1} number`} />
                    <input className={cn(inputClass, "num")} name="partQty" value={p.qty} onChange={(e) => setPart(i, "qty", e.target.value)} inputMode="decimal" placeholder="Qty" aria-label={`Part ${i + 1} quantity`} />
                    <input className={cn(inputClass, "num")} name="partCost" value={p.unitCost} onChange={(e) => setPart(i, "unitCost", e.target.value)} inputMode="decimal" placeholder="$ each" aria-label={`Part ${i + 1} cost each`} />
                  </div>
                </div>
              ))}
              <Button type="button" variant="quiet" className="mt-1 px-0" onClick={() => setParts((prev) => [...prev, { ...BLANK_PART }])}>
                + Add part
              </Button>
            </div>

            <Field label="Notes" className="mt-6">
              <textarea className={cn(inputClass, "min-h-20 resize-y")} name="notes" defaultValue={entry?.notes} placeholder="Next time: ask about the rear pads." />
            </Field>
          </>
        )}

        {(isFuel || isService || (entry?.attachments.length ?? 0) > 0) && (
          <div className="mt-6">
            <AttachmentInput />
          </div>
        )}

        <label className="mt-6 flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" name="odometerReset" defaultChecked={entry?.odometerReset} className="size-5 accent-[var(--signal)]" />
          Odometer was reset or replaced
        </label>

        {state.error && (
          <p className="mt-4 text-sm font-semibold" style={{ color: "var(--signal)" }}>{state.error}</p>
        )}

        {/* Full width, thumb-reachable. */}
        <Button type="submit" variant="primary" disabled={pending} className="mt-8 w-full">
          {pending ? "Saving…" : entry ? "Save changes" : "Save entry"}
        </Button>
      </form>

      {entry && entry.attachments.length > 0 && (
        <div className="mt-8">
          <Label>Attached</Label>
          <AttachmentList
            items={entry.attachments}
            onRemove={(attachmentId) => {
              if (!confirm("Remove this file?")) return;
              const fd = new FormData();
              fd.set("attachmentId", attachmentId);
              startDelete(() => removeEntryAttachment(fd));
            }}
          />
        </div>
      )}

      {entry && (
        <form
          action={deleteEntry}
          className="mt-10 border-t border-rule pt-6"
          onSubmit={(e) => {
            if (!confirm("Delete this entry? You can undo it straight after.")) e.preventDefault();
          }}
        >
          <input type="hidden" name="id" value={entry.id} />
          <input type="hidden" name="vehicleId" value={vehicleId} />
          <Button type="submit" variant="danger" disabled={deleting} className="w-full sm:w-auto">
            Delete entry
          </Button>
        </form>
      )}
    </div>
  );
}
