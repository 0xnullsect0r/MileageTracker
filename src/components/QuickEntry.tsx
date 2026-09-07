"use client";

import { useActionState, useMemo, useState } from "react";
import { createEntry, type EntryState } from "@/app/(app)/vehicles/[id]/entries/new/actions";
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

export function QuickEntry({
  vehicleId,
  vehicleName,
  units,
  categories,
  lastReadingTicks,
  today,
}: {
  vehicleId: string;
  vehicleName: string;
  units: VehicleUnits;
  categories: QuickCategory[];
  lastReadingTicks: number | null;
  today: string;
}) {
  const [state, action, pending] = useActionState<EntryState, FormData>(createEntry, {});
  const [reading, setReading] = useState("");
  const [categoryId, setCategoryId] = useState(
    categories.find((c) => c.code === "P")?.id ?? categories[0]?.id ?? "",
  );

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

  return (
    <form action={action} className="mx-auto w-full max-w-md">
      <input type="hidden" name="vehicleId" value={vehicleId} />
      <input type="hidden" name="categoryId" value={categoryId} />

      <Label>{vehicleName}</Label>

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
          autoFocus
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
              {delta < 0 && " — lower than the last reading"}
            </span>
          ) : last ? (
            <span className="text-ink-muted">
              Last was <span className="num">{formatReading(lastReadingTicks!, units)}</span> {unitLabel(units)}
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-6">
        <Label>Category</Label>
        <div className="mt-2 grid grid-cols-5 gap-2">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategoryId(c.id)}
              aria-pressed={c.id === categoryId}
              title={c.name}
              className={cn(
                "min-h-11 border text-sm font-semibold transition-colors duration-100",
                c.id === categoryId
                  ? "border-ink bg-ink text-paper"
                  : "border-rule text-ink-muted hover:border-ink hover:text-ink",
              )}
            >
              <span className="num">{c.code}</span>
            </button>
          ))}
        </div>
        <p className="mt-1 text-sm text-ink-muted">
          {categories.find((c) => c.id === categoryId)?.name}
        </p>
      </div>

      <div className="mt-6 grid gap-6">
        <Field label="Description">
          <input className={inputClass} name="description" autoComplete="off" placeholder="Errands" />
        </Field>
        <Field label="Date">
          <input className={inputClass} type="date" name="occurredOn" defaultValue={today} required />
        </Field>
      </div>

      {/* Fuel fields appear inline for a fuel category — not a modal, not a
          second step. */}
      {(isFuel || isService) && (
        <>
          <Rule className="mt-8" />
          <div className="mt-6 grid gap-6">
            {isFuel && (
              <div className="grid grid-cols-2 gap-4">
                <Field label={`$ / ${unitLabel(units) === "h" ? "unit" : "gal"}`}>
                  <input className={inputClass} name="pricePerUnit" inputMode="decimal" placeholder="3.279" />
                </Field>
                <Field label="Quantity">
                  <input className={inputClass} name="fuelQty" inputMode="decimal" placeholder="12.4" />
                </Field>
              </div>
            )}
            <Field label="Cost" hint={isFuel ? "Leave blank and it is worked out from price × quantity." : undefined}>
              <input className={inputClass} name="cost" inputMode="decimal" placeholder="40.06" />
            </Field>
            {isFuel && (
              <label className="flex min-h-11 items-center gap-3 text-sm">
                <input type="checkbox" name="isPartialFill" className="size-4 accent-[var(--signal)]" />
                Partial fill — did not fill the tank
              </label>
            )}
          </div>
        </>
      )}

      <label className="mt-6 flex min-h-11 items-center gap-3 text-sm">
        <input type="checkbox" name="odometerReset" className="size-4 accent-[var(--signal)]" />
        Odometer was reset or replaced
      </label>

      {state.error && (
        <p className="mt-4 text-sm font-semibold" style={{ color: "var(--signal)" }}>{state.error}</p>
      )}

      {/* Full width, thumb-reachable. */}
      <Button type="submit" variant="primary" disabled={pending} className="mt-8 w-full">
        {pending ? "Saving…" : "Save entry"}
      </Button>
    </form>
  );
}
