"use client";

import { useActionState, useState } from "react";
import {
  archiveCategory,
  saveCategory,
  saveRate,
  type SettingsState,
} from "@/app/(app)/admin/settings/actions";
import { Button, Field, Label, Rule, inputClass } from "@/components/ui";

export interface RateRow { year: number; rateBusiness: string }
export interface CatRow {
  id: string;
  code: string;
  name: string;
  kind: "TRIP" | "FUEL" | "SERVICE" | "NOTE";
  isBusiness: boolean;
}

const KIND_HELP: Record<CatRow["kind"], string> = {
  TRIP: "Ordinary driving.",
  FUEL: "Shows the fuel fields and joins the economy maths.",
  SERVICE: "Shows vendor and cost, and can close a reminder.",
  NOTE: "Carries no journey of its own.",
};

export function AdminSettings({ rates, cats }: { rates: RateRow[]; cats: CatRow[] }) {
  const [rateState, rateAction, savingRate] = useActionState<SettingsState, FormData>(saveRate, {});
  const [catState, catAction, savingCat] = useActionState<SettingsState, FormData>(saveCategory, {});
  const [editing, setEditing] = useState<CatRow | null>(null);

  return (
    <div className="max-w-3xl">
      <section>
        <Label>Categories</Label>
        <p className="mt-1 max-w-prose text-sm text-ink-muted">
          The kind decides behaviour; whether it counts as business is separate, so a business
          fuel stop still counts toward business distance.
        </p>
        <div className="mt-4">
          {cats.map((c) => (
            <div key={c.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-rule py-3">
              <span className="num w-8 font-semibold">{c.code}</span>
              <span className="text-sm">{c.name}</span>
              <span className="text-[0.75rem] uppercase tracking-[0.06em] text-ink-muted">{c.kind}</span>
              {c.isBusiness && <span className="text-[0.75rem] text-ink-muted">business</span>}
              <div className="ml-auto flex gap-4">
                <button
                  type="button"
                  onClick={() => setEditing(editing?.id === c.id ? null : c)}
                  className="min-h-11 text-sm text-ink-muted hover:text-ink"
                >
                  Edit
                </button>
                <form action={archiveCategory}>
                  <input type="hidden" name="id" value={c.id} />
                  <button type="submit" className="min-h-11 text-sm text-ink-muted hover:text-[var(--signal)]">
                    Archive
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>

        <form action={catAction} className="mt-6 grid gap-6 sm:grid-cols-2">
          <input type="hidden" name="id" value={editing?.id ?? ""} />
          <Field label="Code" hint="One or two characters reads best in the log.">
            <input className={inputClass} name="code" defaultValue={editing?.code ?? ""} key={`c${editing?.id ?? "new"}`} required maxLength={4} />
          </Field>
          <Field label="Name">
            <input className={inputClass} name="name" defaultValue={editing?.name ?? ""} key={`n${editing?.id ?? "new"}`} required />
          </Field>
          <Field label="Kind" hint={KIND_HELP[editing?.kind ?? "TRIP"]}>
            <select className={inputClass} name="kind" defaultValue={editing?.kind ?? "TRIP"} key={`k${editing?.id ?? "new"}`}>
              <option value="TRIP">Trip</option>
              <option value="FUEL">Fuel</option>
              <option value="SERVICE">Service</option>
              <option value="NOTE">Note</option>
            </select>
          </Field>
          <label className="flex min-h-11 items-center gap-3 self-end text-sm">
            <input type="checkbox" name="isBusiness" defaultChecked={editing?.isBusiness ?? false} key={`b${editing?.id ?? "new"}`} className="size-4 accent-[var(--signal)]" />
            Counts as business for tax
          </label>
          <div className="sm:col-span-2">
            {catState.error && <p className="mb-3 text-sm font-semibold" style={{ color: "var(--signal)" }}>{catState.error}</p>}
            {catState.ok && <p className="mb-3 text-sm text-ink-muted">{catState.ok}</p>}
            <div className="flex gap-3">
              <Button type="submit" variant="primary" disabled={savingCat}>
                {editing ? "Save category" : "Add category"}
              </Button>
              {editing && <Button type="button" variant="quiet" onClick={() => setEditing(null)}>New instead</Button>}
            </div>
          </div>
        </form>
      </section>

      <Rule className="my-10" />

      <section>
        <Label>IRS standard mileage rates</Label>
        <p className="mt-1 max-w-prose text-sm text-ink-muted">
          Dollars per business mile, used by the reports page. Seeded with the published rates;
          correct one here if it changes.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-x-8 sm:grid-cols-3">
          {rates.map((r) => (
            <div key={r.year} className="flex items-baseline justify-between border-b border-rule py-2">
              <span className="num text-sm">{r.year}</span>
              <span className="num text-sm">${Number(r.rateBusiness).toFixed(3)}</span>
            </div>
          ))}
        </div>

        <form action={rateAction} className="mt-6 flex flex-wrap items-end gap-4">
          <Field label="Year"><input className={`${inputClass} w-28`} name="year" inputMode="numeric" required /></Field>
          <Field label="Rate per mile" error={rateState.error}>
            <input className={`${inputClass} w-32`} name="rateBusiness" inputMode="decimal" placeholder="0.700" required />
          </Field>
          <Button type="submit" disabled={savingRate}>{savingRate ? "Saving…" : "Set rate"}</Button>
          {rateState.ok && <p className="text-sm text-ink-muted">{rateState.ok}</p>}
        </form>
      </section>
    </div>
  );
}
