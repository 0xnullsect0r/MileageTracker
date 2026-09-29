import "server-only";
import type { OpenReminder } from "@/components/QuickEntry";
import type { ServiceReminder } from "@/db/schema";
import { describeDue } from "@/lib/due-text";
import { dueStatus } from "@/lib/maintenance";
import type { VehicleUnits } from "@/lib/units";

/** Open reminders as the service form's checklist, most urgent first. */
export function reminderOptions(
  reminders: readonly ServiceReminder[],
  current: number | null,
  today: string,
  units: VehicleUnits,
): OpenReminder[] {
  return reminders
    .map((r) => {
      const s = dueStatus({ ...r, snoozedUntil: null }, current, today, units);
      return {
        id: r.id,
        description: r.description,
        suggested: s.state !== "ok",
        statusText: describeDue(s, r.dueMode === "READING" ? null : r.dueOn, r.dueMode === "DATE" ? null : r.dueReadingTicks, units).primary,
        rank: s.progress ?? 0,
      };
    })
    .sort((a, b) => Number(b.suggested) - Number(a.suggested) || b.rank - a.rank)
    .map(({ rank: _rank, ...r }) => r);
}
