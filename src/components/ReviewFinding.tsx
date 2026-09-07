"use client";

import { useState, useTransition } from "react";
import { saveDecision } from "@/app/(app)/import/actions";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { Decision } from "@/lib/import/plan";

export interface FindingView {
  rowRef: string;
  type: string;
  field: string;
  severity: "ERROR" | "WARN";
  message: string;
  suggestions: { label: string; value: number; reason: string }[];
  defaultAction: "CORRECT" | "SKIP" | "ASK";
  /** The offending value and its neighbours, already formatted. */
  context: { ref: string; date: string; display: string; description: string; isSubject: boolean }[];
  currentDisplay: string;
  decision: Decision | null;
}

export function ReviewFinding({
  batchId,
  finding,
  ticksPerUnit,
}: {
  batchId: string;
  finding: FindingView;
  ticksPerUnit: number;
}) {
  const [pending, start] = useTransition();
  const [custom, setCustom] = useState("");
  const decided = finding.decision;

  const decide = (d: Omit<Decision, "rowRef" | "field">) =>
    start(() => {
      void saveDecision(batchId, { rowRef: finding.rowRef, field: finding.field, ...d });
    });

  const isError = finding.severity === "ERROR";

  return (
    <article
      className={cn("border-l-[3px] py-5 pl-4", decided && "opacity-60")}
      style={{
        borderLeftColor: isError ? "var(--signal)" : "var(--rule)",
        background: isError && !decided
          ? "color-mix(in srgb, var(--signal-bright) 12%, transparent)"
          : undefined,
      }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-sm">{finding.message}</p>
        <span className="num shrink-0 text-[0.75rem] text-ink-muted">
          {finding.rowRef.replace("!", ", row ")}
        </span>
      </div>

      {/* The offending value in the company of its neighbours. Read in
          sequence, a wrong number gives itself away before any explanation. */}
      {finding.context.length > 0 && (
        <div className="mt-3 max-w-lg">
          {finding.context.map((c) => (
            <div
              key={c.ref}
              className={cn(
                "grid grid-cols-[5.5rem_7rem_1fr] items-baseline gap-3 border-b border-rule py-1.5",
                !c.isSubject && "text-ink-muted",
              )}
            >
              <span className="num text-[0.8125rem]">{c.date}</span>
              <span
                className={cn("num text-right text-[0.9375rem]", c.isSubject && "font-semibold")}
                style={c.isSubject ? { color: "var(--signal)" } : undefined}
              >
                {c.display}
              </span>
              <span className="truncate text-[0.8125rem]">{c.description}</span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        {finding.suggestions.map((s) => (
          <button
            key={s.value}
            type="button"
            disabled={pending}
            onClick={() => decide({ action: "CORRECT", value: s.value })}
            className={cn(
              "min-h-11 border px-3 text-sm transition-colors duration-100",
              decided?.action === "CORRECT" && decided.value === s.value
                ? "border-ink bg-ink text-paper"
                : "border-rule hover:border-ink",
            )}
            title={s.reason}
          >
            {/* Struck original, proposed value — the change itself, not a description of it. */}
            <span className="num text-ink-muted line-through">{finding.currentDisplay}</span>
            <span className="mx-2 text-ink-muted">→</span>
            <span className="num font-semibold">{s.label}</span>
          </button>
        ))}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(custom.replace(/[$,\s]/g, ""));
            if (Number.isFinite(n)) decide({ action: "CORRECT", value: scaleCustom(finding.field, n, ticksPerUnit) });
          }}
          className="flex items-center gap-2"
        >
          <label className="sr-only" htmlFor={`custom-${finding.rowRef}-${finding.field}`}>
            Your own value
          </label>
          <input
            id={`custom-${finding.rowRef}-${finding.field}`}
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            inputMode="decimal"
            placeholder="Own value"
            className="num min-h-11 w-28 border-0 border-b border-rule bg-transparent px-0 text-sm focus:border-signal focus:outline-none"
          />
          {custom.trim() !== "" && (
            <Button type="submit" disabled={pending}>Use</Button>
          )}
        </form>

        <button
          type="button"
          disabled={pending}
          onClick={() => decide({ action: "KEEP" })}
          className={cn(
            "min-h-11 px-2 text-sm",
            decided?.action === "KEEP" ? "font-semibold text-ink underline" : "text-ink-muted hover:text-ink",
          )}
        >
          Keep as is
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => decide({ action: "SKIP" })}
          className={cn(
            "min-h-11 px-2 text-sm",
            decided?.action === "SKIP" ? "font-semibold text-ink underline" : "text-ink-muted hover:text-ink",
          )}
        >
          Skip row
        </button>

        {decided && (
          <span className="num text-[0.75rem] text-ink-muted">
            {decided.action === "CORRECT" ? "corrected" : decided.action === "SKIP" ? "skipping" : "keeping"}
          </span>
        )}
      </div>

      {finding.suggestions[0] && (
        <p className="mt-2 text-[0.8125rem] text-ink-muted">{finding.suggestions[0].reason}</p>
      )}
    </article>
  );
}

/**
 * Readings are stored in ticks, so a typed reading is scaled to match — by
 * the vehicle's own rate, which is 60 for an hour meter and 100 for an
 * odometer. Hardcoding 100 would quietly corrupt every tractor.
 */
function scaleCustom(field: string, n: number, ticksPerUnit: number): number {
  return field === "reading" ? Math.round(n * ticksPerUnit) : n;
}
