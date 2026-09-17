"use client";

import { useTransition } from "react";
import { deleteReminder, markReminderDone } from "@/app/(app)/vehicles/[id]/service/actions";
import { formatReading, unitLabel } from "@/lib/units";
import type { VehicleUnits } from "@/lib/units";

export function ReminderRow({
  id,
  description,
  remaining,
  overdue,
  overdueByDate,
  dueOn,
  units,
  progress,
}: {
  id: string;
  description: string;
  remaining: number | null;
  overdue: boolean;
  overdueByDate: boolean;
  dueOn: string | null;
  units: VehicleUnits;
  progress: number | null;
}) {
  const [pending, start] = useTransition();

  return (
    <div className="border-b border-rule py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-sm">{description}</span>
        <span
          className="num shrink-0 text-sm"
          style={overdue ? { color: "var(--signal)", fontWeight: 600 } : undefined}
        >
          {remaining !== null
            ? overdue
              ? `overdue by ${formatReading(Math.abs(remaining), units)} ${unitLabel(units)}`
              : `${formatReading(remaining, units)} ${unitLabel(units)} to go`
            : dueOn
              ? overdueByDate ? `overdue since ${dueOn}` : `due ${dueOn}`
              : "—"}
        </span>
      </div>
      {progress !== null && (
        <div className="mt-2 h-px w-full bg-rule">
          <div
            className="h-px"
            style={{ width: `${progress}%`, background: overdue ? "var(--signal)" : "var(--ink-muted)" }}
          />
        </div>
      )}
      <div className="mt-2 flex gap-4 text-[0.75rem]">
        <button
          type="button"
          disabled={pending}
          onClick={() => start(() => markReminderDone(id, true))}
          className="min-h-8 text-ink-muted hover:text-ink disabled:opacity-50"
        >
          Mark done
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (confirm(`Delete this reminder?\n\n"${description}"`)) {
              start(() => deleteReminder(id));
            }
          }}
          className="min-h-8 text-ink-muted hover:text-signal disabled:opacity-50"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
