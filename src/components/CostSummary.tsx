import { Num } from "@/components/Reading";
import { Label } from "@/components/ui";
import type { CostBreakdown } from "@/lib/costs";

/**
 * Money figures side by side, each under its own label. "Per mile" is only
 * shown when there is distance to divide by.
 */
export function CostSummary({
  year,
  thisYear,
  allTime,
  perUnit,
  unit,
}: {
  year: number;
  thisYear: CostBreakdown;
  allTime: CostBreakdown;
  perUnit: number | null;
  unit: string;
}) {
  const rows: [string, keyof CostBreakdown][] = [
    ["Fuel", "fuel"],
    ["Service", "service"],
    ["Fees", "fees"],
    ["Other", "other"],
  ];
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full max-w-xl text-sm">
        <thead>
          <tr className="border-b border-rule text-left">
            <th className="py-2 font-normal"><span className="sr-only">Kind</span></th>
            <th className="py-2 text-right font-normal"><Label>{year}</Label></th>
            <th className="py-2 text-right font-normal"><Label>All time</Label></th>
          </tr>
        </thead>
        <tbody>
          {rows
            .filter(([, k]) => allTime[k] > 0)
            .map(([label, k]) => (
              <tr key={k} className="border-b border-rule">
                <td className="py-1.5 text-ink-muted">{label}</td>
                <td className="py-1.5 text-right"><Num value={thisYear[k]} prefix="$" /></td>
                <td className="py-1.5 text-right"><Num value={allTime[k]} prefix="$" /></td>
              </tr>
            ))}
          <tr className="border-b-[1.5px] border-ink">
            <td className="py-2 font-semibold">Total</td>
            <td className="py-2 text-right font-semibold"><Num value={thisYear.total} prefix="$" /></td>
            <td className="py-2 text-right font-semibold"><Num value={allTime.total} prefix="$" /></td>
          </tr>
        </tbody>
      </table>
      {perUnit !== null && (
        <p className="mt-3 text-sm text-ink-muted">
          <span className="computed num px-1 text-ink">${perUnit.toFixed(2)}</span> per {unit} over the life of the log.
        </p>
      )}
    </div>
  );
}
