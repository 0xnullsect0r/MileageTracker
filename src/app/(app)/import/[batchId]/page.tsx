import { notFound } from "next/navigation";
import { Climb } from "@/components/Climb";
import { ReviewFinding, type FindingView } from "@/components/ReviewFinding";
import { Button, Label, Rule, Stat } from "@/components/ui";
import { unitsOf } from "@/lib/data";
import { formatReading, ticksPerUnit } from "@/lib/units";
import { acceptAllSuggested, commitDraft, discardDraft, loadDraft } from "../actions";

export const dynamic = "force-dynamic";

const TYPE_ORDER = [
  "READING_SPIKE", "FUEL_QTY_IMPLAUSIBLE", "READING_REVERSAL", "READING_ORDER",
  "COST_MISMATCH", "FUEL_QTY_MISSING", "DATE_OUT_OF_RANGE", "MISSING_DATE",
  "CATEGORY_MISSING", "CATEGORY_UNKNOWN", "DUPLICATE_ROW",
];

const TYPE_LABEL: Record<string, string> = {
  READING_SPIKE: "Readings that cannot be right",
  READING_REVERSAL: "Readings that go backwards",
  READING_ORDER: "Readings out of sequence",
  FUEL_QTY_IMPLAUSIBLE: "Impossible fuel quantities",
  FUEL_QTY_MISSING: "Fill-ups with no quantity",
  COST_MISMATCH: "Costs that do not match price × quantity",
  DATE_OUT_OF_RANGE: "Dates in the wrong year",
  MISSING_DATE: "Rows with no date",
  CATEGORY_MISSING: "Rows with no category",
  CATEGORY_UNKNOWN: "Unrecognised category codes",
  DUPLICATE_ROW: "Rows repeated from elsewhere in the file",
};

export default async function ReviewPage({ params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await params;
  const draft = await loadDraft(batchId);
  if (!draft) notFound();

  const { plan, vehicle, decisions, batch } = draft;
  const units = unitsOf(vehicle);
  const per = ticksPerUnit(units);
  const byRef = new Map(plan.rows.map((r) => [r.ref, r]));
  const orderedRefs = plan.rows.map((r) => r.ref);
  const decisionFor = (rowRef: string, field: string) =>
    decisions.find((d) => d.rowRef === rowRef && d.field === field) ?? null;

  const views: FindingView[] = plan.findings.map((f) => {
    const row = byRef.get(f.rowRef);
    const idx = orderedRefs.indexOf(f.rowRef);
    const window = [idx - 1, idx, idx + 1]
      .filter((i) => i >= 0 && i < plan.rows.length)
      .map((i) => plan.rows[i]!);

    return {
      rowRef: f.rowRef,
      type: f.type,
      field: f.field,
      severity: f.severity,
      message: f.message,
      suggestions: f.suggestions,
      defaultAction: f.defaultAction,
      currentDisplay: currentValue(f.field, row, per, units),
      context:
        f.field === "reading" || f.field === "date"
          ? window.map((r) => ({
              ref: r.ref,
              date: r.occurredOn ?? "—",
              display: r.readingTicks === null ? "—" : formatReading(r.readingTicks, units),
              description: r.description ?? "",
              isSubject: r.ref === f.rowRef,
            }))
          : [],
      decision: decisionFor(f.rowRef, f.field),
    };
  });

  const grouped = TYPE_ORDER.map((type) => ({
    type,
    label: TYPE_LABEL[type] ?? type,
    items: views.filter((v) => v.type === type),
  })).filter((g) => g.items.length > 0);

  const outstanding = views.filter((v) => v.severity === "ERROR" && v.decision === null).length;
  const autoFixable = plan.findings.filter(
    (f) => f.defaultAction === "CORRECT" && f.suggestions.length === 1 && decisionFor(f.rowRef, f.field) === null,
  ).length;

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-8">
      <Label>{batch.filename}</Label>
      <h1 className="mt-1 text-[2rem] font-semibold tracking-tight">Check before importing</h1>

      <div className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-4">
        <Stat label="Rows read"><span className="num text-[1.5rem]">{plan.stats.rowsRead.toLocaleString("en-US")}</span></Stat>
        <Stat label="Blank, dropped"><span className="num text-[1.5rem]">{plan.stats.blankRowsDropped}</span></Stat>
        <Stat label="Needs a decision"><span className="num text-[1.5rem]">{plan.stats.errors}</span></Stat>
        <Stat label="Worth a look"><span className="num text-[1.5rem]">{plan.stats.warnings}</span></Stat>
      </div>

      {/* The batch on the vehicle's own scale: a bad reading shows as a mark
          stranded far from the climb it should sit on. */}
      <div className="mt-8">
        <Climb
          entries={plan.rows.map((r) => ({
            readingTicks: r.readingTicks,
            occurredOn: r.occurredOn ?? "",
            kind: "TRIP" as const,
            needsReview: plan.findings.some((f) => f.rowRef === r.ref && f.severity === "ERROR"),
          }))}
          units={units}
          height={44}
          robustScale
        />
      </div>

      <Rule strong className="my-8" />

      <div className="flex flex-wrap items-center gap-3">
        {autoFixable > 0 && (
          <form action={async () => { "use server"; await acceptAllSuggested(batchId); }}>
            <Button type="submit">Accept the {autoFixable} unambiguous {autoFixable === 1 ? "correction" : "corrections"}</Button>
          </form>
        )}
        <span className="text-sm text-ink-muted">
          {outstanding === 0
            ? "Everything serious has been decided."
            : `${outstanding} still to decide.`}
        </span>
      </div>

      {grouped.map((g) => (
        <section key={g.type} className="mt-10">
          <div className="flex items-baseline justify-between gap-4">
            <Label>{g.label}</Label>
            <span className="num text-[0.75rem] text-ink-muted">{g.items.length}</span>
          </div>
          <div className="mt-2">
            {g.items.slice(0, 40).map((f) => (
              <ReviewFinding key={`${f.rowRef}-${f.field}`} batchId={batchId} finding={f} ticksPerUnit={per} />
            ))}
            {g.items.length > 40 && (
              <p className="mt-3 text-sm text-ink-muted">
                …and {g.items.length - 40} more of the same kind. They import as they stand,
                flagged for review, unless you skip them here.
              </p>
            )}
          </div>
        </section>
      ))}

      <Rule strong className="my-10" />

      <div className="flex flex-wrap items-center gap-4">
        <form action={commitDraft}>
          <input type="hidden" name="batchId" value={batchId} />
          <Button type="submit" variant="primary">
            Import into {vehicle.name}
          </Button>
        </form>
        <form action={discardDraft}>
          <input type="hidden" name="batchId" value={batchId} />
          <Button type="submit" variant="quiet">Discard</Button>
        </form>
        <p className="text-sm text-ink-muted">
          Anything left undecided is imported as it stands and flagged, never corrected silently.
          The whole import can be undone afterwards.
        </p>
      </div>
    </main>
  );
}

function currentValue(
  field: string,
  row: { readingTicks: number | null; fuelQty: number | null; cost: number | null; occurredOn: string | null } | undefined,
  per: number,
  units: Parameters<typeof formatReading>[1],
): string {
  if (!row) return "—";
  switch (field) {
    case "reading":
      return row.readingTicks === null ? "—" : formatReading(row.readingTicks, units);
    case "fuelQty":
      return row.fuelQty === null ? "—" : String(row.fuelQty);
    case "cost":
      return row.cost === null ? "—" : `$${row.cost.toFixed(2)}`;
    case "date":
      return row.occurredOn ?? "—";
    default:
      return "—";
  }
}
