"use client";

import { useActionState } from "react";
import { type ReminderState, completeReminder } from "@/app/(app)/vehicles/[id]/service/actions";
import { buttonClass } from "@/components/ui";

/**
 * One tap from the garage: done today, at the latest reading. Anything more
 * particular belongs on the vehicle's service page.
 */
export function QuickDone({ id, label }: { id: string; label: string }) {
  const [state, action, pending] = useActionState<ReminderState, FormData>(completeReminder, {});
  if (state.ok) return <span className="text-sm text-ink-muted" role="status">Done</span>;
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={pending} className={buttonClass("secondary", "min-h-11 px-3 text-sm")} aria-label={`Mark ${label} done today`}>
        {pending ? "…" : "Done"}
      </button>
      {state.error && <span className="sr-only" role="alert">{state.error}</span>}
    </form>
  );
}
