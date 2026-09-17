"use client";

import { useActionState } from "react";
import { Button, Field, Label, inputClass } from "@/components/ui";
import { readingInputProps, unitLabel, unitNoun } from "@/lib/units";
import type { VehicleUnits } from "@/lib/units";
import { type ReminderState, createReminder } from "@/app/(app)/vehicles/[id]/service/actions";

const initial: ReminderState = {};

export function ReminderForm({
  vehicleId,
  units,
}: {
  vehicleId: string;
  units: VehicleUnits;
}) {
  const [state, action, pending] = useActionState(createReminder, initial);
  const input = readingInputProps(units);

  return (
    <form action={action} className="mt-4 max-w-2xl">
      <input type="hidden" name="vehicleId" value={vehicleId} />
      <Field label="What">
        <input
          name="description"
          type="text"
          required
          className={inputClass}
          placeholder="Oil change, timing belt, brake inspection…"
        />
      </Field>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label={`Due at (${unitNoun(units)})`} hint={`Reading target. Optional if a date is set.`}>
          <input
            name="dueReading"
            type="text"
            step={input.step}
            inputMode={input.inputMode}
            pattern={input.pattern}
            className={inputClass}
            placeholder={input.placeholder}
          />
        </Field>
        <Field label="Due on" hint="Calendar date. Optional if a reading is set.">
          <input name="dueOn" type="date" className={inputClass} />
        </Field>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label={`Every (${unitLabel(units)})`} hint="Interval, so a fresh one appears next cycle.">
          <input
            name="intervalReading"
            type="text"
            step={input.step}
            inputMode={input.inputMode}
            pattern={input.pattern}
            className={inputClass}
            placeholder={input.placeholder}
          />
        </Field>
        <Field label="Every (months)">
          <input
            name="intervalMonths"
            type="number"
            min="1"
            step="1"
            className={inputClass}
            placeholder="e.g. 12"
          />
        </Field>
      </div>
      {state.error && (
        <p className="mt-3 text-sm font-semibold" style={{ color: "var(--signal)" }}>
          {state.error}
        </p>
      )}
      <div className="mt-6 flex items-center gap-4">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Saving…" : "Add reminder"}
        </Button>
        {state.ok && !state.error && (
          <span className="text-sm text-ink-muted">Saved.</span>
        )}
      </div>
    </form>
  );
}
