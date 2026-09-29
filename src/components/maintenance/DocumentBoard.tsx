"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import * as Menu from "@radix-ui/react-dropdown-menu";
import {
  type DocumentState,
  deleteDocument,
  renewDocument,
  saveDocument,
} from "@/app/(app)/vehicles/[id]/docs/actions";
import { AttachmentInput, AttachmentList, type AttachmentView } from "@/components/Attachments";
import { Num } from "@/components/Reading";
import { Sheet } from "@/components/Sheet";
import { Button, Field, Label, inputClass } from "@/components/ui";
import { cn } from "@/lib/cn";
import { describeDue } from "@/lib/due-text";
import { DOCUMENT_KIND_LABEL, type DocumentKind, type DueStatus, addMonthsIso } from "@/lib/maintenance";
import { type VehicleUnits, readingInputProps, unitLabel } from "@/lib/units";

export interface BoardDocument {
  id: string;
  kind: DocumentKind;
  title: string;
  provider: string;
  reference: string;
  startsOn: string;
  expiresOn: string;
  expiresAtReading: string;
  expiresAtReadingTicks: number | null;
  renewEveryMonths: string;
  cost: number | null;
  notes: string;
  isArchived: boolean;
  status: DueStatus;
  attachments: AttachmentView[];
}

const KINDS = Object.keys(DOCUMENT_KIND_LABEL) as DocumentKind[];
const DEFAULT_RENEW: Partial<Record<DocumentKind, string>> = { REGISTRATION: "12", INSURANCE: "6", INSPECTION: "12", EMISSIONS: "24" };

export function DocumentBoard({
  vehicleId,
  units,
  today,
  documents,
}: {
  vehicleId: string;
  units: VehicleUnits;
  today: string;
  documents: BoardDocument[];
}) {
  const [editing, setEditing] = useState<BoardDocument | null>(null);
  const [adding, setAdding] = useState(false);
  const [renewing, setRenewing] = useState<BoardDocument | null>(null);
  const current = documents.filter((d) => !d.isArchived);
  const past = documents.filter((d) => d.isArchived);

  return (
    <section aria-labelledby="docs-h">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="docs-h" className="text-lg font-semibold tracking-tight">Documents</h2>
        <Button variant="secondary" onClick={() => setAdding(true)}>Add document</Button>
      </div>
      <p className="mt-1 max-w-prose text-sm text-ink-muted">
        Registration, insurance, inspections and warranties. Anything expiring shows up with what is due, and what
        each one cost counts toward the vehicle&rsquo;s running costs.
      </p>

      {current.length === 0 ? (
        <p className="mt-6 border-t border-rule pt-4 text-sm text-ink-muted">Nothing on file yet.</p>
      ) : (
        <ul className="mt-6 border-t border-rule">
          {current.map((d) => (
            <DocumentRow key={d.id} d={d} units={units} onEdit={() => setEditing(d)} onRenew={() => setRenewing(d)} />
          ))}
        </ul>
      )}

      {past.length > 0 && (
        <details className="mt-10">
          <summary className="flex min-h-11 cursor-pointer items-center text-sm text-ink-muted hover:text-ink">
            Past periods ({past.length})
          </summary>
          <ul className="mt-2 border-t border-rule">
            {past.map((d) => (
              <DocumentRow key={d.id} d={d} units={units} onEdit={() => setEditing(d)} />
            ))}
          </ul>
        </details>
      )}

      <DocumentDialog open={adding} onOpenChange={setAdding} vehicleId={vehicleId} units={units} />
      <DocumentDialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} vehicleId={vehicleId} units={units} doc={editing ?? undefined} />
      <RenewDialog open={renewing !== null} onOpenChange={(o) => !o && setRenewing(null)} doc={renewing} today={today} />
    </section>
  );
}

function DocumentRow({ d, units, onEdit, onRenew }: { d: BoardDocument; units: VehicleUnits; onEdit: () => void; onRenew?: () => void }) {
  const [pending, start] = useTransition();
  const text = describeDue(d.status, d.expiresOn || null, d.expiresAtReadingTicks, units, null, true);
  const urgent = d.status.state === "overdue" || d.status.state === "due";
  const soon = d.status.state === "soon";
  const hasExpiry = d.expiresOn !== "" || d.expiresAtReadingTicks !== null;

  return (
    <li className={cn("border-b border-rule py-3", pending && "opacity-50", d.isArchived && "text-ink-muted")}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <span className="block text-[0.75rem] font-semibold uppercase tracking-[0.06em] text-ink-muted">
            {DOCUMENT_KIND_LABEL[d.kind]}
          </span>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4">
            <span className="text-base">{d.title}</span>
            {!d.isArchived && hasExpiry && (
              <span className={cn("num text-sm", (urgent || soon) && "text-signal", urgent && "font-semibold")}>
                {text.primary}
              </span>
            )}
          </div>
          <div className="num mt-0.5 flex flex-wrap gap-x-4 text-[0.8125rem] text-ink-muted">
            {d.provider && <span className="font-sans">{d.provider}</span>}
            {d.reference && <span>{d.reference}</span>}
            {(d.startsOn || d.expiresOn) && (
              <span>
                {d.startsOn || "…"} → {d.expiresOn || "…"}
              </span>
            )}
            {d.cost !== null && <Num value={d.cost} prefix="$" />}
          </div>
          {d.notes && <p className="mt-1 text-sm text-ink-muted">{d.notes}</p>}
          <AttachmentList items={d.attachments} />
        </div>
        <div className="flex shrink-0 items-center">
          {onRenew && d.renewEveryMonths && (
            <Button variant={urgent || soon ? "primary" : "secondary"} className="px-3" onClick={onRenew}>
              Renew
            </Button>
          )}
          <Menu.Root modal={false}>
            <Menu.Trigger className="inline-flex size-11 items-center justify-center text-ink-muted hover:text-ink" aria-label={`More for ${d.title}`}>
              <span aria-hidden className="text-lg leading-none">⋯</span>
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Content align="end" sideOffset={4} className="z-50 min-w-[10rem] rounded-[2px] border border-ink bg-paper-raised py-1">
                <Menu.Item onSelect={onEdit} className="flex min-h-11 cursor-default items-center px-3 text-sm outline-none data-[highlighted]:bg-paper">
                  Edit
                </Menu.Item>
                {onRenew && !d.renewEveryMonths && (
                  <Menu.Item onSelect={onRenew} className="flex min-h-11 cursor-default items-center px-3 text-sm outline-none data-[highlighted]:bg-paper">
                    Renew
                  </Menu.Item>
                )}
                <Menu.Item
                  onSelect={() => {
                    if (!confirm(`Delete “${d.title}” and its files?`)) return;
                    const fd = new FormData();
                    fd.set("id", d.id);
                    start(() => deleteDocument(fd));
                  }}
                  className="flex min-h-11 cursor-default items-center px-3 text-sm outline-none data-[highlighted]:bg-paper"
                >
                  Delete
                </Menu.Item>
              </Menu.Content>
            </Menu.Portal>
          </Menu.Root>
        </div>
      </div>
    </li>
  );
}

function DocumentDialog({
  open,
  onOpenChange,
  vehicleId,
  units,
  doc,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  vehicleId: string;
  units: VehicleUnits;
  doc?: BoardDocument;
}) {
  const [state, action, pending] = useActionState<DocumentState, FormData>(saveDocument, {});
  const [kind, setKind] = useState<DocumentKind>(doc?.kind ?? "INSURANCE");
  const [renew, setRenew] = useState(doc?.renewEveryMonths ?? DEFAULT_RENEW.INSURANCE ?? "");
  useEffect(() => {
    if (open) {
      setKind(doc?.kind ?? "INSURANCE");
      setRenew(doc?.renewEveryMonths ?? DEFAULT_RENEW.INSURANCE ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    if (state.ok) onOpenChange(false);
  }, [state.ok, onOpenChange]);
  const rp = readingInputProps(units);

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={doc ? "Edit document" : "Add a document"}>
      <form action={action} className="grid gap-6" key={doc?.id ?? "new"}>
        <input type="hidden" name="vehicleId" value={vehicleId} />
        <input type="hidden" name="id" value={doc?.id ?? ""} />
        <input type="hidden" name="kind" value={kind} />
        <div>
          <Label>Kind</Label>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {KINDS.map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={kind === k}
                onClick={() => {
                  setKind(k);
                  if (!doc) setRenew(DEFAULT_RENEW[k] ?? "");
                }}
                className={cn(
                  "min-h-11 rounded-[2px] border px-2 text-sm",
                  kind === k ? "border-ink bg-ink text-paper" : "border-rule hover:border-ink",
                )}
              >
                {DOCUMENT_KIND_LABEL[k]}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          <Field label="Name">
            <input className={inputClass} name="title" defaultValue={doc?.title ?? ""} placeholder={DOCUMENT_KIND_LABEL[kind]} />
          </Field>
          <Field label="Provider">
            <input className={inputClass} name="provider" defaultValue={doc?.provider ?? ""} placeholder={kind === "INSURANCE" ? "State Farm" : ""} />
          </Field>
          <Field label="Policy or reference no.">
            <input className={cn(inputClass, "num")} name="reference" defaultValue={doc?.reference ?? ""} />
          </Field>
          <Field label="Cost">
            <input className={inputClass} name="cost" inputMode="decimal" defaultValue={doc?.cost?.toFixed(2) ?? ""} placeholder="612.40" />
          </Field>
          <Field label="Starts">
            <input className={inputClass} type="date" name="startsOn" defaultValue={doc?.startsOn ?? ""} />
          </Field>
          <Field label="Expires">
            <input className={inputClass} type="date" name="expiresOn" defaultValue={doc?.expiresOn ?? ""} />
          </Field>
          <label className="block">
            <Label>Renews every</Label>
            <span className="mt-1 flex items-baseline gap-2">
              <input className={inputClass} name="renewEveryMonths" inputMode="numeric" value={renew} onChange={(e) => setRenew(e.target.value)} placeholder="12" />
              <span className="text-sm text-ink-muted">months</span>
            </span>
          </label>
          {kind === "WARRANTY" && (
            <label className="block">
              <Label>Or ends at</Label>
              <span className="mt-1 flex items-baseline gap-2">
                <input className={cn(inputClass, "num")} name="expiresAtReading" inputMode={rp.inputMode} defaultValue={doc?.expiresAtReading ?? ""} placeholder="36000" />
                <span className="text-sm text-ink-muted">{unitLabel(units)}</span>
              </span>
            </label>
          )}
        </div>
        <Field label="Notes">
          <input className={inputClass} name="notes" defaultValue={doc?.notes ?? ""} />
        </Field>
        <AttachmentInput label="Card, policy or certificate" />
        {doc && doc.attachments.length > 0 && <AttachmentList items={doc.attachments} />}
        {state.error && <p className="text-sm font-semibold" style={{ color: "var(--signal)" }}>{state.error}</p>}
        <Button type="submit" variant="primary" disabled={pending} className="w-full sm:w-auto">
          {pending ? "Saving…" : doc ? "Save changes" : "Add document"}
        </Button>
      </form>
    </Sheet>
  );
}

function RenewDialog({
  open,
  onOpenChange,
  doc,
  today,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  doc: BoardDocument | null;
  today: string;
}) {
  const [state, action, pending] = useActionState<DocumentState, FormData>(renewDocument, {});
  useEffect(() => {
    if (state.ok) onOpenChange(false);
  }, [state.ok, onOpenChange]);
  if (!doc) return null;

  const start = doc.expiresOn || today;
  const months = Number(doc.renewEveryMonths) || null;
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={`Renew ${doc.title}`} description="This period is kept on file; the new one takes its place.">
      <form action={action} className="grid gap-6" key={doc.id}>
        <input type="hidden" name="id" value={doc.id} />
        <div className="grid grid-cols-2 gap-4">
          <Field label="New period starts">
            <input className={inputClass} type="date" name="startsOn" defaultValue={start} required />
          </Field>
          <Field label="Expires">
            <input className={inputClass} type="date" name="expiresOn" defaultValue={months ? addMonthsIso(start, months) : ""} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Cost">
            <input className={inputClass} name="cost" inputMode="decimal" defaultValue={doc.cost?.toFixed(2) ?? ""} />
          </Field>
          <Field label="Reference no.">
            <input className={cn(inputClass, "num")} name="reference" defaultValue={doc.reference} />
          </Field>
        </div>
        {state.error && <p className="text-sm font-semibold" style={{ color: "var(--signal)" }}>{state.error}</p>}
        <Button type="submit" variant="primary" disabled={pending} className="w-full sm:w-auto">
          {pending ? "Saving…" : "Renew"}
        </Button>
      </form>
    </Sheet>
  );
}
