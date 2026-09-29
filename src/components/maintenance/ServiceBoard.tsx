"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import * as Menu from "@radix-ui/react-dropdown-menu";
import {
  type ReminderState,
  addPresets,
  completeReminder,
  deleteReminder,
  snoozeReminder,
} from "@/app/(app)/vehicles/[id]/service/actions";
import { Sheet } from "@/components/Sheet";
import { Button, Field, Label, inputClass } from "@/components/ui";
import { cn } from "@/lib/cn";
import { describeDue } from "@/lib/due-text";
import type { DueStatus } from "@/lib/maintenance";
import { type VehicleUnits, formatReading, readingInputProps, unitLabel } from "@/lib/units";
import { type PresetOption, type ReminderDefaults, ReminderDialog } from "./ReminderDialog";

export interface BoardReminder extends ReminderDefaults {
  status: DueStatus;
  dueOnActual: string | null;
  dueReadingTicks: number | null;
  snoozedUntil: string | null;
  intervalText: string | null;
}

interface Common {
  vehicleId: string;
  units: VehicleUnits;
  currentTicks: number | null;
  today: string;
  presets: PresetOption[];
}

const GROUPS: [string, (s: DueStatus) => boolean][] = [
  ["Due now", (s) => s.state === "overdue" || s.state === "due"],
  ["Coming up", (s) => s.state === "soon"],
  ["Later", (s) => s.state === "ok"],
];

/** The reminders on a vehicle's service page, and everything you can do to them. */
export function ServiceBoard({ reminders, ...c }: Common & { reminders: BoardReminder[] }) {
  const [editing, setEditing] = useState<ReminderDefaults | null>(null);
  const [adding, setAdding] = useState(false);
  const [presetsOpen, setPresetsOpen] = useState(false);

  return (
    <section aria-labelledby="reminders-h">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="reminders-h" className="text-lg font-semibold tracking-tight">Reminders</h2>
        <div className="flex gap-2">
          {c.presets.length > 0 && (
            <Button variant="quiet" onClick={() => setPresetsOpen(true)}>Add several</Button>
          )}
          <Button variant="secondary" onClick={() => setAdding(true)}>Add reminder</Button>
        </div>
      </div>

      {reminders.length === 0 ? (
        <div className="mt-4 border-t border-rule pt-4">
          <p className="max-w-prose text-sm text-ink-muted">
            Nothing is being tracked. Start with the usual items for this vehicle and adjust the intervals to suit.
          </p>
          {c.presets.length > 0 && (
            <Button variant="primary" className="mt-4" onClick={() => setPresetsOpen(true)}>
              Set up the usual
            </Button>
          )}
        </div>
      ) : (
        GROUPS.map(([label, test]) => {
          const inGroup = reminders.filter((r) => test(r.status));
          if (inGroup.length === 0) return null;
          return (
            <div key={label} className="mt-6">
              <Label>{label}</Label>
              <ul className="mt-2 border-t border-rule">
                {inGroup.map((r) => (
                  <ReminderItem key={r.id} r={r} {...c} onEdit={() => setEditing(r)} />
                ))}
              </ul>
            </div>
          );
        })
      )}

      <ReminderDialog open={adding} onOpenChange={setAdding} {...c} />
      <ReminderDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        {...c}
        reminder={editing ?? undefined}
      />
      <PresetPicker open={presetsOpen} onOpenChange={setPresetsOpen} vehicleId={c.vehicleId} presets={c.presets} units={c.units} existing={reminders.map((r) => r.templateKey)} />
    </section>
  );
}

function ReminderItem({ r, onEdit, ...c }: Common & { r: BoardReminder; onEdit: () => void }) {
  const [doneOpen, setDoneOpen] = useState(false);
  const [pending, start] = useTransition();
  const text = describeDue(r.status, r.dueOnActual, r.dueReadingTicks, c.units, r.snoozedUntil);
  const urgent = r.status.state === "overdue" || r.status.state === "due";

  const run = (fn: (f: FormData) => Promise<void>, extra: Record<string, string> = {}) => {
    const fd = new FormData();
    fd.set("id", r.id);
    for (const [k, v] of Object.entries(extra)) fd.set(k, v);
    start(() => fn(fd));
  };

  return (
    <li className={cn("border-b border-rule py-3", pending && "opacity-50")}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
            <span className="text-base">{r.description}</span>
            <span className={cn("num text-sm", urgent && "font-semibold text-signal")}>{text.primary}</span>
          </div>
          <div className="mt-0.5 flex flex-wrap justify-between gap-x-4 text-[0.8125rem] text-ink-muted">
            <span>{[r.intervalText, r.notes].filter(Boolean).join(" · ")}</span>
            {text.secondary && <span className="num">{text.secondary}</span>}
          </div>
          {r.status.progress !== null && (
            <div className="mt-2 h-px w-full bg-rule" aria-hidden>
              <div
                className="h-px"
                style={{ width: `${Math.round(r.status.progress * 100)}%`, background: urgent ? "var(--signal)" : "var(--ink-muted)" }}
              />
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center">
          <Button variant={urgent ? "primary" : "secondary"} className="min-w-16 px-3" onClick={() => setDoneOpen(true)}>
            Done
          </Button>
          <Menu.Root modal={false}>
            <Menu.Trigger className="inline-flex size-11 items-center justify-center text-ink-muted hover:text-ink" aria-label={`More for ${r.description}`}>
              <span aria-hidden className="text-lg leading-none">⋯</span>
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Content align="end" sideOffset={4} className="z-50 min-w-[11rem] rounded-[2px] border border-ink bg-paper-raised py-1">
                <MenuItem onSelect={onEdit}>Edit</MenuItem>
                <MenuItem onSelect={() => run(snoozeReminder, { days: "7" })}>Snooze a week</MenuItem>
                <MenuItem onSelect={() => run(snoozeReminder, { days: "30" })}>Snooze a month</MenuItem>
                <Menu.Separator className="my-1 h-px bg-rule" />
                <MenuItem
                  onSelect={() => {
                    if (confirm(`Delete “${r.description}”? Its history goes with it.`)) run(deleteReminder);
                  }}
                >
                  Delete
                </MenuItem>
              </Menu.Content>
            </Menu.Portal>
          </Menu.Root>
        </div>
      </div>
      <DoneDialog open={doneOpen} onOpenChange={setDoneOpen} r={r} {...c} />
    </li>
  );
}

function MenuItem({ children, onSelect }: { children: React.ReactNode; onSelect: () => void }) {
  return (
    <Menu.Item onSelect={onSelect} className="flex min-h-11 cursor-default items-center px-3 text-sm outline-none data-[highlighted]:bg-paper">
      {children}
    </Menu.Item>
  );
}

function DoneDialog({
  open,
  onOpenChange,
  r,
  units,
  currentTicks,
  today,
}: Common & { open: boolean; onOpenChange: (o: boolean) => void; r: BoardReminder }) {
  const [state, action, pending] = useActionState<ReminderState, FormData>(completeReminder, {});
  useEffect(() => {
    if (state.ok) onOpenChange(false);
  }, [state.ok, onOpenChange]);
  const rp = readingInputProps(units);

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={`${r.description} — done`} description="The next one is scheduled from here.">
      <form action={action} className="grid gap-6">
        <input type="hidden" name="id" value={r.id} />
        <div className="grid grid-cols-2 gap-4">
          <Field label="On">
            <input className={inputClass} type="date" name="doneOn" defaultValue={today} required />
          </Field>
          <Field label={`At (${unitLabel(units)})`}>
            <input
              className={cn(inputClass, "num")}
              name="doneReading"
              inputMode={rp.inputMode}
              placeholder={currentTicks !== null ? formatReading(currentTicks, units, { grouped: false }) : rp.placeholder}
            />
          </Field>
        </div>
        <p className="-mt-3 text-sm text-ink-muted">
          Leave the reading blank to use the latest one. To record what it cost, log it as a service entry instead —
          that ticks this off too.
        </p>
        {state.error && <p className="text-sm font-semibold" style={{ color: "var(--signal)" }}>{state.error}</p>}
        <Button type="submit" variant="primary" disabled={pending} className="w-full sm:w-auto">
          {pending ? "Saving…" : "Mark done"}
        </Button>
      </form>
    </Sheet>
  );
}

function PresetPicker({
  open,
  onOpenChange,
  vehicleId,
  presets,
  units,
  existing,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  vehicleId: string;
  presets: PresetOption[];
  units: VehicleUnits;
  existing: string[];
}) {
  const [state, action, pending] = useActionState<ReminderState, FormData>(addPresets, {});
  useEffect(() => {
    if (state.ok) onOpenChange(false);
  }, [state.ok, onOpenChange]);
  const unit = unitLabel(units);

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="The usual items"
      description="Each starts counting from today. Edit any of them afterwards."
    >
      <form action={action}>
        <input type="hidden" name="vehicleId" value={vehicleId} />
        <ul className="border-t border-rule">
          {presets.map((p) => {
            const have = existing.includes(p.key);
            return (
              <li key={p.key} className="border-b border-rule">
                <label className={cn("flex min-h-12 items-center gap-3 text-base", have && "text-ink-muted")}>
                  <input type="checkbox" name="preset" value={p.key} defaultChecked={!have && ["oil", "tire-rotation", "h-engine-oil", "h-grease"].includes(p.key)} disabled={have} className="size-5 accent-[var(--signal)]" />
                  <span className="flex-1">{p.name}</span>
                  <span className="num text-[0.8125rem] text-ink-muted">
                    {have
                      ? "tracked"
                      : [p.every ? `${p.every.toLocaleString("en-US")} ${unit}` : null, p.months ? `${p.months} mo` : null]
                          .filter(Boolean)
                          .join(" / ")}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        {state.error && <p className="mt-4 text-sm font-semibold" style={{ color: "var(--signal)" }}>{state.error}</p>}
        <Button type="submit" variant="primary" disabled={pending} className="mt-6 w-full sm:w-auto">
          {pending ? "Adding…" : "Add selected"}
        </Button>
      </form>
    </Sheet>
  );
}
