"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { type ReminderState, saveReminder } from "@/app/(app)/vehicles/[id]/service/actions";
import { Sheet } from "@/components/Sheet";
import { Button, Field, Label, inputClass } from "@/components/ui";
import { cn } from "@/lib/cn";
import { type DueMode, nextCycle } from "@/lib/maintenance";
import {
  type VehicleUnits,
  formatReading,
  parseReading,
  readingInputProps,
  unitLabel,
  unitsToTicks,
} from "@/lib/units";

export interface PresetOption {
  key: string;
  name: string;
  every: number | null;
  months: number | null;
}

export interface ReminderDefaults {
  id: string;
  description: string;
  dueMode: DueMode;
  every: string;
  everyMonths: string;
  lastDoneReading: string;
  lastDoneOn: string;
  dueReading: string;
  dueOn: string;
  notes: string;
  templateKey: string;
}

const EMPTY: Omit<ReminderDefaults, "id"> = {
  description: "",
  dueMode: "EITHER",
  every: "",
  everyMonths: "",
  lastDoneReading: "",
  lastDoneOn: "",
  dueReading: "",
  dueOn: "",
  notes: "",
  templateKey: "",
};

export function ReminderDialog({
  open,
  onOpenChange,
  vehicleId,
  units,
  currentTicks,
  today,
  presets,
  reminder,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicleId: string;
  units: VehicleUnits;
  currentTicks: number | null;
  today: string;
  presets: PresetOption[];
  reminder?: ReminderDefaults;
}) {
  const [state, action, pending] = useActionState<ReminderState, FormData>(saveReminder, {});
  const [f, setF] = useState(reminder ?? { ...EMPTY, id: "" });
  const set = (k: keyof ReminderDefaults) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  // Reset to the reminder being edited each time the sheet opens.
  useEffect(() => {
    if (open) setF(reminder ?? { ...EMPTY, id: "" });
    // Only on opening: `reminder` is rebuilt by the parent on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Close once saved.
  useEffect(() => {
    if (state.ok) onOpenChange(false);
  }, [state.ok, onOpenChange]);

  const unit = unitLabel(units);
  const rp = readingInputProps(units);
  const bothIntervals = f.every.trim() !== "" && f.everyMonths.trim() !== "";

  // The same arithmetic the server will do, shown before the tap.
  const preview = useMemo(() => {
    try {
      const every = f.every.trim() ? Number(f.every.replace(/,/g, "")) : null;
      const months = f.everyMonths.trim() ? Number(f.everyMonths) : null;
      const lastTicks = f.lastDoneReading.trim() ? parseReading(f.lastDoneReading, units) : currentTicks;
      const intervalTicks = every && every > 0 ? unitsToTicks(every, units) : null;
      const intervalMonths = months && months > 0 ? Math.round(months) : null;
      const mode: DueMode = bothIntervals ? f.dueMode : intervalTicks ? "READING" : "DATE";
      const c = nextCycle({ dueMode: mode, intervalTicks, intervalMonths, dueReadingTicks: null }, f.lastDoneOn || today, lastTicks);
      const reading = f.dueReading.trim() ? parseReading(f.dueReading, units) : c.dueReadingTicks;
      const on = f.dueOn || c.dueOn;
      const parts: string[] = [];
      if (reading !== null && mode !== "DATE") parts.push(`${formatReading(reading, units)} ${unit}`);
      if (on && mode !== "READING") parts.push(on);
      if (parts.length === 0) return null;
      return parts.length === 2 ? `${parts[0]} or ${parts[1]}, whichever comes first` : parts[0];
    } catch {
      return null;
    }
  }, [f, units, currentTicks, today, unit, bothIntervals]);

  const pick = (p: PresetOption) =>
    setF((prev) => ({
      ...prev,
      description: p.name,
      every: p.every?.toString() ?? "",
      everyMonths: p.months?.toString() ?? "",
      templateKey: p.key,
      dueMode: "EITHER",
    }));

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={reminder ? "Edit reminder" : "Add a reminder"}
      description={reminder ? undefined : "Pick a common one or write your own."}
    >
      <form action={action} className="grid gap-6">
        <input type="hidden" name="vehicleId" value={vehicleId} />
        <input type="hidden" name="id" value={f.id} />
        <input type="hidden" name="templateKey" value={f.templateKey} />

        {!reminder && presets.length > 0 && (
          <div>
            <Label>Common</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {presets.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => pick(p)}
                  aria-pressed={f.templateKey === p.key}
                  className={cn(
                    "min-h-11 rounded-[2px] border px-3 text-sm",
                    f.templateKey === p.key ? "border-ink bg-ink text-paper" : "border-rule text-ink hover:border-ink",
                  )}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <Field label="What">
          <input className={inputClass} name="description" value={f.description} onChange={set("description")} required placeholder="Oil & filter" />
        </Field>

        <div>
          <Label>Repeat every</Label>
          <div className="mt-1 grid grid-cols-2 gap-4">
            <label className="flex items-baseline gap-2">
              <input className={inputClass} name="every" inputMode="numeric" value={f.every} onChange={set("every")} placeholder="5000" aria-label={`Every how many ${unit}`} />
              <span className="text-sm text-ink-muted">{unit}</span>
            </label>
            <label className="flex items-baseline gap-2">
              <input className={inputClass} name="everyMonths" inputMode="numeric" value={f.everyMonths} onChange={set("everyMonths")} placeholder="6" aria-label="Every how many months" />
              <span className="text-sm text-ink-muted">months</span>
            </label>
          </div>
          <p className="mt-1 text-sm text-ink-muted">Fill either or both. Leave both blank for a one-off.</p>
        </div>

        {bothIntervals ? (
          <Field label="Due">
            <select className={inputClass} name="dueMode" value={f.dueMode} onChange={set("dueMode")}>
              <option value="EITHER">Whichever comes first</option>
              <option value="READING">At the {unit === "h" ? "hours" : "distance"} only</option>
              <option value="DATE">On the date only</option>
            </select>
          </Field>
        ) : (
          <input type="hidden" name="dueMode" value="EITHER" />
        )}

        <div>
          <Label>Last done</Label>
          <div className="mt-1 grid grid-cols-2 gap-4">
            <label className="flex items-baseline gap-2">
              <input
                className={cn(inputClass, "num")}
                name="lastDoneReading"
                inputMode={rp.inputMode}
                value={f.lastDoneReading}
                onChange={set("lastDoneReading")}
                placeholder={currentTicks !== null ? formatReading(currentTicks, units, { grouped: false }) : rp.placeholder}
                aria-label="Reading when last done"
              />
              <span className="text-sm text-ink-muted">{unit}</span>
            </label>
            <input className={inputClass} type="date" name="lastDoneOn" value={f.lastDoneOn} onChange={set("lastDoneOn")} aria-label="Date last done" />
          </div>
          <p className="mt-1 text-sm text-ink-muted">Not sure? Leave it — it counts from now.</p>
        </div>

        <details className="group" open={!!(f.dueReading || f.dueOn)}>
          <summary className="flex min-h-11 cursor-pointer list-none items-center text-sm text-ink-muted hover:text-ink">
            <span className="mr-2 inline-block transition-transform group-open:rotate-90">›</span>
            Set the next due point yourself
          </summary>
          <div className="mt-2 grid grid-cols-2 gap-4">
            <label className="flex items-baseline gap-2">
              <input className={cn(inputClass, "num")} name="dueReading" inputMode={rp.inputMode} value={f.dueReading} onChange={set("dueReading")} aria-label="Due at reading" placeholder="Due at" />
              <span className="text-sm text-ink-muted">{unit}</span>
            </label>
            <input className={inputClass} type="date" name="dueOn" value={f.dueOn} onChange={set("dueOn")} aria-label="Due on date" />
          </div>
        </details>

        <Field label="Notes">
          <input className={inputClass} name="notes" value={f.notes} onChange={set("notes")} placeholder="0W-20, 4.4 qt" />
        </Field>

        <p className="min-h-6 text-sm">
          {preview ? (
            <>
              <span className="text-ink-muted">Next due </span>
              <span className="num">{preview}</span>
            </>
          ) : null}
        </p>

        {state.error && <p className="text-sm font-semibold" style={{ color: "var(--signal)" }}>{state.error}</p>}

        <Button type="submit" variant="primary" disabled={pending} className="w-full sm:w-auto">
          {pending ? "Saving…" : reminder ? "Save changes" : "Add reminder"}
        </Button>
      </form>
    </Sheet>
  );
}
