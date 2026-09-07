"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { CategoryMark, categoryBorder, type CategoryLike } from "@/components/Category";
import { cn } from "@/lib/cn";
import {
  type VehicleUnits,
  formatDelta,
  formatReading,
  splitChangedDigits,
  ticksToUnits,
  unitLabel,
} from "@/lib/units";

export interface TableRow {
  id: string;
  occurredOn: string;
  readingTicks: number | null;
  distanceTicks: number | null;
  description: string | null;
  categoryCode: string | null;
  categoryName: string | null;
  categoryKind: "TRIP" | "FUEL" | "SERVICE" | "NOTE" | null;
  fuelQty: number | null;
  pricePerUnit: number | null;
  cost: number | null;
  economy: number | null;
  needsReview: boolean;
  reviewReason: string | null;
  importOriginalValue: string | null;
}

const ROW_DESKTOP = 36;
const ROW_TOUCH = 44; // meets the 44px tap target on small screens

export function EntriesTable({
  rows,
  units,
  categories,
  initialReviewOnly = false,
}: {
  rows: TableRow[];
  units: VehicleUnits;
  categories: CategoryLike[];
  initialReviewOnly?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [year, setYear] = useState<string>("all");
  const [cats, setCats] = useState<Set<string>>(new Set());
  const [reviewOnly, setReviewOnly] = useState(initialReviewOnly);

  const years = useMemo(
    () => [...new Set(rows.map((r) => r.occurredOn.slice(0, 4)))].sort().reverse(),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (reviewOnly && !r.needsReview) return false;
      if (year !== "all" && !r.occurredOn.startsWith(year)) return false;
      if (cats.size > 0 && (r.categoryCode === null || !cats.has(r.categoryCode))) return false;
      if (q && !(r.description ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, query, year, cats, reviewOnly]);

  // Rows are taller on touch. The virtualizer needs one number, so it is
  // measured rather than guessed.
  const [rowHeight, setRowHeight] = useState(ROW_DESKTOP);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const apply = () => setRowHeight(mq.matches ? ROW_DESKTOP : ROW_TOUCH);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const parentRef = useRef<HTMLDivElement>(null);
  const virt = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 14,
  });

  const toggleCat = (code: string) =>
    setCats((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });

  const reviewCount = rows.filter((r) => r.needsReview).length;

  return (
    <div>
      {/* One ruled filter bar. */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-rule py-3">
        <label className="sr-only" htmlFor="entry-search">Search descriptions</label>
        <input
          id="entry-search"
          className="min-h-11 w-full max-w-56 border-0 border-b border-rule bg-transparent px-0 text-sm focus:border-signal focus:outline-none sm:w-56"
          placeholder="Search…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <label className="lg:hidden">
          <span className="sr-only">Year</span>
          <select
            className="min-h-11 border-0 border-b border-rule bg-transparent px-0 text-sm focus:border-signal focus:outline-none"
            value={year}
            onChange={(e) => setYear(e.target.value)}
          >
            <option value="all">All years</option>
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </label>
        <div className="hidden flex-wrap items-center gap-1 lg:flex">
          <FilterChip active={year === "all"} onClick={() => setYear("all")}>All</FilterChip>
          {years.map((y) => (
            <FilterChip key={y} active={year === y} onClick={() => setYear(y)}>{y}</FilterChip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {categories.map((c) => (
            <FilterChip
              key={c.code}
              active={cats.has(c.code)}
              onClick={() => toggleCat(c.code)}
              title={c.name}
            >
              {c.code}
            </FilterChip>
          ))}
        </div>
        {reviewCount > 0 && (
          <FilterChip active={reviewOnly} onClick={() => setReviewOnly((v) => !v)}>
            Needs review ({reviewCount})
          </FilterChip>
        )}
        <span className="num ml-auto text-[0.75rem] text-ink-muted">
          {filtered.length.toLocaleString("en-US")} of {rows.length.toLocaleString("en-US")}
        </span>
      </div>

      {/* Column labels: sans, uppercase, tracked. Figures below are all mono. */}
      <div
        className={cn(
          "grid gap-x-3 border-b border-rule py-2 text-[0.75rem] font-semibold uppercase tracking-[0.06em] text-ink-muted",
          GRID_CLASS,
        )}
      >
        <span>Date</span>
        <span className="whitespace-nowrap text-right">Reading</span>
        <span className="order-last text-right lg:order-none">Δ</span>
        <span className="hidden text-center lg:block">Cat</span>
        <span>Description</span>
        <span className="hidden text-right lg:block">${unitLabel(units) === "h" ? "/unit" : "/gal"}</span>
        <span className="hidden text-right lg:block">Qty</span>
        <span className="hidden text-right lg:block">Cost</span>
        <span className="hidden text-right lg:block">{unitLabel(units)}/gal</span>
      </div>

      <div ref={parentRef} className="h-[calc(100dvh-320px)] min-h-96 overflow-auto">
        <div style={{ height: virt.getTotalSize(), position: "relative" }}>
          {virt.getVirtualItems().map((item) => {
            const r = filtered[item.index]!;
            const prev = filtered[item.index - 1] ?? null;
            const category: CategoryLike | null = r.categoryCode
              ? {
                  code: r.categoryCode,
                  name: r.categoryName ?? r.categoryCode,
                  kind: r.categoryKind ?? "TRIP",
                }
              : null;
            const value = r.readingTicks === null ? null : formatReading(r.readingTicks, units);
            const reference =
              prev?.readingTicks == null || r.readingTicks === null
                ? null
                : formatReading(prev.readingTicks, units);
            const split = value === null ? null : splitChangedDigits(value, reference);

            return (
              <div
                key={r.id}
                className={cn(
                  "absolute left-0 top-0 grid w-full items-baseline gap-x-3 border-b border-rule py-1.5 pl-2",
                  GRID_CLASS,
                  // Every fifth row takes a heavier rule — the accountant's
                  // convention for keeping your place, and cheaper than zebra.
                  (item.index + 1) % 5 === 0 && "border-b-[1.5px]",
                )}
                style={{
                  height: rowHeight,
                  transform: `translateY(${item.start}px)`,
                  ...categoryBorder(category),
                  ...(r.needsReview
                    ? { background: "color-mix(in srgb, var(--signal-bright) 16%, transparent)" }
                    : {}),
                }}
                title={r.reviewReason ?? undefined}
              >
                <span className="num whitespace-nowrap text-[0.8125rem] text-ink-muted">
                  <span className="lg:hidden">{r.occurredOn.slice(5)}</span>
                  <span className="hidden lg:inline">{r.occurredOn}</span>
                </span>
                <span className="num whitespace-nowrap text-right text-[0.8125rem]">
                  {split === null ? (
                    <span className="text-ink-muted">—</span>
                  ) : (
                    <>
                      {split.shared && <span className="text-ink-muted">{split.shared}</span>}
                      <span>{split.changed}</span>
                    </>
                  )}
                </span>
                <span className="num order-last whitespace-nowrap text-right text-[0.8125rem] text-ink-muted lg:order-none">
                  {r.distanceTicks === null ? (
                    "—"
                  ) : (
                    <span className="computed px-1">
                      {formatDelta(r.distanceTicks, units, { withUnit: false })}
                    </span>
                  )}
                </span>
                <span className="hidden text-center lg:block"><CategoryMark category={category} /></span>
                <span className="truncate text-[0.8125rem]">
                  {/* The category letter rides with the description on
                      narrow screens, where its own column would not fit. */}
                  {category && (
                    <span className="num mr-1.5 text-[0.75rem] font-semibold lg:hidden" style={{ color: `var(--cat-${categoryToken(category.code)})` }}>
                      {category.code}
                    </span>
                  )}
                  {r.description}
                </span>
                <Cell value={r.pricePerUnit} dp={3} prefix="$" />
                <Cell value={r.fuelQty} dp={3} />
                <Cell value={r.cost} dp={2} prefix="$" />
                <span className="num hidden text-right text-[0.8125rem] text-ink-muted lg:block">
                  {r.economy === null ? null : (
                    <span className="computed px-1">{ticksToUnits(r.economy, units).toFixed(1)}</span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * Two layouts, not one that shrinks.
 *
 * Below 768px the fuel columns are dropped entirely and the row becomes
 * date / reading / description / delta — a ruled list. Squeezing the
 * nine-column grid instead produced horizontal scroll at 375, 768 and 1024,
 * which the brief treats as a hard failure.
 */
const GRID_CLASS =
  "grid-cols-[3.25rem_4.75rem_minmax(5rem,1fr)_3.5rem] " +
  // lg, not md: the nine-column grid needs ~880px, and md begins at exactly
  // 768 — the one width where it engages and immediately overflows.
  "lg:grid-cols-[6rem_6rem_4.75rem_2.25rem_minmax(8rem,1fr)_4.5rem_4.5rem_5rem_4rem]";

function categoryToken(code: string): string {
  return { B: "business", P: "personal", G: "gas", S: "service" }[code] ?? "info";
}

function Cell({ value, dp, prefix = "" }: { value: number | null; dp: number; prefix?: string }) {
  return (
    <span className="num hidden text-right text-[0.8125rem] lg:block">
      {value === null ? "" : `${prefix}${value.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`}
    </span>
  );
}

function FilterChip({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  // Underline-selected, not a pill.
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={cn(
        "min-h-11 px-2 text-sm transition-colors duration-100",
        active ? "border-b-2 border-signal font-semibold text-ink" : "border-b-2 border-transparent text-ink-muted hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}
