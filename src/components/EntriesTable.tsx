"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useVirtualizer } from "@tanstack/react-virtual";
import { CategoryMark, categoryBorder, type CategoryLike } from "@/components/Category";
import { cn } from "@/lib/cn";
import {
  DEFAULT_VIEW,
  type LogView,
  SORT_KEYS,
  type SortDir,
  type SortKey,
  defaultDir,
  filterRows,
  isFiltered,
  sortRows,
  viewToSearch,
} from "@/lib/log-view";
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
const MIN_PREVIEW = 8;
const MAX_PREVIEW = 30;

export function EntriesTable({
  vehicleId,
  rows,
  units,
  categories,
  initialView = DEFAULT_VIEW,
}: {
  vehicleId: string;
  rows: TableRow[];
  units: VehicleUnits;
  categories: CategoryLike[];
  initialView?: LogView;
}) {
  const [view, setView] = useState<LogView>(initialView);
  const patch = (p: Partial<LogView>) => setView((v) => ({ ...v, ...p }));

  const years = useMemo(
    () => [...new Set(rows.map((r) => r.occurredOn.slice(0, 4)))].sort().reverse(),
    [rows],
  );

  const filtered = useMemo(() => filterRows(rows, view), [rows, view]);
  const sorted = useMemo(() => sortRows(filtered, view.sort, view.dir), [filtered, view.sort, view.dir]);

  // The reading's changed digits are measured against the entry before it in
  // time, not the row above it — under a cost sort the row above is anything.
  const previousReading = useMemo(() => {
    const m = new Map<string, number | null>();
    let last: number | null = null;
    for (const r of filtered) {
      m.set(r.id, last);
      if (r.readingTicks !== null) last = r.readingTicks;
    }
    return m;
  }, [filtered]);

  // Keep the view in the URL, so opening an entry and coming back — or
  // reloading — returns to it. Skipped on mount, which would drop ?deleted=.
  // Debounced: Safari throttles replaceState, and search writes per keystroke.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const t = setTimeout(() => {
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${viewToSearch(view)}`);
    }, 250);
    return () => clearTimeout(t);
  }, [view]);

  // Rows are taller on touch. The virtualizer needs one number, so it is
  // measured rather than guessed.
  const [rowHeight, setRowHeight] = useState(ROW_DESKTOP);
  useEffect(() => {
    // Large text scales the rows and the lg breakpoint along with the type.
    const scale = document.documentElement.dataset.text === "large" ? 1.25 : 1;
    const mq = window.matchMedia(`(min-width: ${64 * scale}rem)`);
    const apply = () => setRowHeight(Math.round((mq.matches ? ROW_DESKTOP : ROW_TOUCH) * scale));
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // The log opens on the latest screenful, sized to the display; the full
  // history is one tap away. Rows that fit after leaving room for the page
  // above and the bars around it — about a dozen on a phone, twenty on a
  // laptop.
  const [showAll, setShowAll] = useState(false);
  const [limit, setLimit] = useState(12);
  useEffect(() => {
    const apply = () =>
      setLimit(Math.min(MAX_PREVIEW, Math.max(MIN_PREVIEW, Math.floor((window.innerHeight - 200) / rowHeight))));
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, [rowHeight]);
  const collapsed = !showAll && sorted.length > limit;
  const shown = collapsed ? limit : sorted.length;

  const parentRef = useRef<HTMLDivElement>(null);
  const virt = useVirtualizer({
    count: shown,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 14,
  });

  // A new order or a new filter starts from the top, not mid-list.
  useEffect(() => {
    parentRef.current?.scrollTo({ top: 0 });
  }, [view]);

  const toggleCat = (code: string) =>
    setView((v) => ({
      ...v,
      cats: v.cats.includes(code) ? v.cats.filter((c) => c !== code) : [...v.cats, code],
    }));

  // A second click on the sorted column reverses it; a new column starts in
  // its natural direction.
  const sortBy = (key: SortKey) =>
    setView((v) => ({
      ...v,
      sort: key,
      dir: v.sort === key ? (v.dir === "asc" ? "desc" : "asc") : defaultDir(key),
    }));

  const reviewCount = rows.filter((r) => r.needsReview).length;
  const perUnit = unitLabel(units) === "h" ? "/unit" : "/gal";
  const header = { view, onSort: sortBy };

  return (
    <div>
      {/* One ruled filter bar. */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-rule py-3">
        <label className="sr-only" htmlFor="entry-search">Search descriptions</label>
        <input
          id="entry-search"
          type="search"
          className="min-h-11 w-full max-w-56 border-0 border-b border-rule bg-transparent px-0 text-sm focus:border-signal focus:outline-none sm:w-56"
          placeholder="Search…"
          value={view.q}
          onChange={(e) => patch({ q: e.target.value })}
        />
        <label className="lg:hidden">
          <span className="sr-only">Year</span>
          <select
            className="min-h-11 border-0 border-b border-rule bg-transparent px-0 text-sm focus:border-signal focus:outline-none"
            value={view.year}
            onChange={(e) => patch({ year: e.target.value })}
          >
            <option value="all">All years</option>
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </label>
        <div className="hidden flex-wrap items-center gap-1 lg:flex">
          <FilterChip active={view.year === "all"} onClick={() => patch({ year: "all" })}>All</FilterChip>
          {years.map((y) => (
            <FilterChip key={y} active={view.year === y} onClick={() => patch({ year: y })}>{y}</FilterChip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {categories.map((c) => (
            <FilterChip
              key={c.code}
              active={view.cats.includes(c.code)}
              onClick={() => toggleCat(c.code)}
              title={c.name}
            >
              {c.code}
            </FilterChip>
          ))}
        </div>
        {reviewCount > 0 && (
          <FilterChip active={view.reviewOnly} onClick={() => patch({ reviewOnly: !view.reviewOnly })}>
            Needs review ({reviewCount})
          </FilterChip>
        )}
      </div>

      {/* Second line: the narrower cuts, and the order. */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-rule py-3 text-sm">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="flex items-center gap-2">
            <label htmlFor="entry-from" className="text-ink-muted">From</label>
            <input
              id="entry-from"
              type="date"
              className="num min-h-11 border-0 border-b border-rule bg-transparent px-0 text-sm focus:border-signal focus:outline-none"
              value={view.from}
              max={view.to || undefined}
              onChange={(e) => patch({ from: e.target.value })}
            />
          </span>
          <span className="flex items-center gap-2">
            <label htmlFor="entry-to" className="text-ink-muted">to</label>
            <input
              id="entry-to"
              type="date"
              className="num min-h-11 border-0 border-b border-rule bg-transparent px-0 text-sm focus:border-signal focus:outline-none"
              value={view.to}
              min={view.from || undefined}
              onChange={(e) => patch({ to: e.target.value })}
            />
          </span>
        </div>

        {/* Below lg most columns are hidden, so their headers cannot be
            clicked; the order is picked here instead. */}
        <div className="flex items-center gap-2 lg:hidden">
          <label htmlFor="entry-sort" className="text-ink-muted">Sort</label>
          <select
            id="entry-sort"
            className="min-h-11 border-0 border-b border-rule bg-transparent px-0 text-sm focus:border-signal focus:outline-none"
            value={view.sort}
            onChange={(e) => {
              const key = e.target.value as SortKey;
              patch({ sort: key, dir: defaultDir(key) });
            }}
          >
            {SORT_KEYS.map((k) => (
              <option key={k} value={k}>{sortLabel(k, units)}</option>
            ))}
          </select>
          <button
            type="button"
            className="inline-flex min-h-11 min-w-11 items-center justify-center text-ink-muted hover:text-ink"
            onClick={() => patch({ dir: view.dir === "asc" ? "desc" : "asc" })}
            aria-label={`${dirText(view.sort, view.dir)}. Reverse the order`}
            title="Reverse the order"
          >
            <SortArrow dir={view.dir} />
            <span className="ml-1">{dirText(view.sort, view.dir)}</span>
          </button>
        </div>

        {isFiltered(view) && (
          <button
            type="button"
            className="min-h-11 text-ink-muted underline hover:text-ink"
            onClick={() => setView((v) => ({ ...DEFAULT_VIEW, sort: v.sort, dir: v.dir }))}
          >
            Clear filters
          </button>
        )}
        <span className="num ml-auto text-[0.75rem] text-ink-muted" role="status">
          {sorted.length.toLocaleString("en-US")} of {rows.length.toLocaleString("en-US")}
        </span>
      </div>

      {/* Column labels: sans, uppercase, tracked. Figures below are all mono.
          Each one sorts the log. */}
      <div
        className={cn(
          "grid gap-x-3 border-b border-rule text-[0.75rem] font-semibold uppercase tracking-[0.06em] text-ink-muted",
          GRID_CLASS,
          "log-grid",
        )}
      >
        <SortHeader k="date" {...header}>Date</SortHeader>
        <SortHeader k="reading" align="right" {...header}>Reading</SortHeader>
        <SortHeader k="distance" align="right" className="log-delta order-last lg:order-none" {...header} label="Distance">Δ</SortHeader>
        <SortHeader k="category" align="center" className="hidden lg:block" {...header} label="Category">Cat</SortHeader>
        <SortHeader k="description" {...header}>Description</SortHeader>
        <SortHeader k="price" align="right" className="hidden lg:block" {...header} label={`Price ${perUnit}`}>${perUnit}</SortHeader>
        <SortHeader k="qty" align="right" className="hidden lg:block" {...header} label="Quantity">Qty</SortHeader>
        <SortHeader k="cost" align="right" className="hidden lg:block" {...header}>Cost</SortHeader>
        <SortHeader k="economy" align="right" className="hidden lg:block" {...header} label="Economy">{unitLabel(units)}/gal</SortHeader>
      </div>

      {sorted.length === 0 && (
        <p className="py-8 text-sm text-ink-muted">
          No entries match.{" "}
          {isFiltered(view) && (
            <button type="button" className="min-h-11 underline hover:text-ink" onClick={() => setView((v) => ({ ...DEFAULT_VIEW, sort: v.sort, dir: v.dir }))}>
              Clear filters
            </button>
          )}
        </p>
      )}

      {/* Collapsed, the rows sit in the page at their own height; shown in
          full, they scroll in a window so 3,000 rows stay quick. */}
      <div
        ref={parentRef}
        className={cn(!collapsed && "h-[calc(100dvh-420px)] min-h-96 overflow-auto md:h-[calc(100dvh-360px)]")}
        style={collapsed ? { height: shown * rowHeight } : undefined}
      >
        <div style={{ height: virt.getTotalSize(), position: "relative" }}>
          {virt.getVirtualItems().map((item) => {
            const r = sorted[item.index]!;
            const prevTicks = previousReading.get(r.id) ?? null;
            const category: CategoryLike | null = r.categoryCode
              ? {
                  code: r.categoryCode,
                  name: r.categoryName ?? r.categoryCode,
                  kind: r.categoryKind ?? "TRIP",
                }
              : null;
            const value = r.readingTicks === null ? null : formatReading(r.readingTicks, units);
            const reference =
              prevTicks === null || r.readingTicks === null ? null : formatReading(prevTicks, units);
            const split = value === null ? null : splitChangedDigits(value, reference);

            return (
              // Each row is a link to its edit page: the whole row is the tap target.
              <Link
                key={r.id}
                href={`/vehicles/${vehicleId}/entries/${r.id}`}
                className={cn(
                  "absolute left-0 top-0 grid w-full items-baseline gap-x-3 border-b border-rule py-1.5 pl-2 hover:bg-paper-raised",
                  GRID_CLASS,
                  "log-grid",
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
                <span className="log-delta num order-last whitespace-nowrap text-right text-[0.8125rem] text-ink-muted lg:order-none">
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
              </Link>
            );
          })}
        </div>
      </div>

      {(collapsed || (showAll && sorted.length > limit)) && (
        <div className="flex items-center gap-4 border-t border-rule pt-1">
          <button
            type="button"
            className="min-h-11 text-sm font-semibold text-ink underline underline-offset-4 hover:text-signal"
            onClick={() => setShowAll((v) => !v)}
            aria-expanded={showAll}
          >
            {collapsed ? `Show all ${sorted.length.toLocaleString("en-US")}` : "Show fewer"}
          </button>
          {collapsed && (
            <span className="text-sm text-ink-muted">
              Showing the {view.sort === "date" && view.dir === "desc" ? "latest" : "first"} {shown}
            </span>
          )}
        </div>
      )}
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
  // The description gives way first: at 375 with large text the fixed
  // columns alone take most of the row.
  "grid-cols-[3.25rem_4.75rem_minmax(0,1fr)_3.5rem] " +
  // lg, not md: the nine-column grid needs ~880px, and md begins at exactly
  // 768 — the one width where it engages and immediately overflows.
  "lg:grid-cols-[6rem_6rem_4.75rem_2.25rem_minmax(8rem,1fr)_4.5rem_4.5rem_5rem_4rem]";

function categoryToken(code: string): string {
  return { B: "business", P: "personal", G: "gas", S: "service" }[code] ?? "info";
}

function sortLabel(key: SortKey, units: VehicleUnits): string {
  const perUnit = unitLabel(units) === "h" ? "unit" : "gal";
  return {
    date: "Date",
    reading: "Reading",
    distance: "Distance",
    category: "Category",
    description: "Description",
    price: `Price per ${perUnit}`,
    qty: "Quantity",
    cost: "Cost",
    economy: "Economy",
  }[key];
}

function dirText(key: SortKey, dir: SortDir): string {
  if (key === "date") return dir === "desc" ? "Newest first" : "Oldest first";
  if (key === "category" || key === "description") return dir === "asc" ? "A–Z" : "Z–A";
  return dir === "desc" ? "Highest first" : "Lowest first";
}

function SortArrow({ dir, className }: { dir: SortDir; className?: string }) {
  return (
    <svg viewBox="0 0 10 12" width="10" height="12" aria-hidden className={cn("shrink-0", className)}>
      <path
        d={dir === "desc" ? "M5 1v9M1.5 6.5 5 10l3.5-3.5" : "M5 11V2M1.5 5.5 5 2l3.5 3.5"}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SortHeader({
  k,
  view,
  onSort,
  align = "left",
  className,
  label,
  children,
}: {
  k: SortKey;
  view: LogView;
  onSort: (key: SortKey) => void;
  align?: "left" | "right" | "center";
  className?: string;
  /** Spoken name, when the visible one is an abbreviation. */
  label?: string;
  children: React.ReactNode;
}) {
  const active = view.sort === k;
  const name = label ?? (typeof children === "string" ? children : k);
  // The arrow sits on the inside edge, so a right-aligned label stays flush
  // with the figures under it.
  return (
    <span className={className}>
      <button
        type="button"
        onClick={() => onSort(k)}
        className={cn(
          "inline-flex min-h-11 w-full items-center gap-1 whitespace-nowrap uppercase tracking-[0.06em] lg:min-h-9",
          align === "right" && "flex-row-reverse",
          align === "center" && "justify-center",
          active ? "text-ink" : "hover:text-ink",
        )}
        title={active ? dirText(k, view.dir) : `Sort by ${name.toLowerCase()}`}
      >
        {label ? <><span aria-hidden>{children}</span><span className="sr-only">{label}</span></> : children}
        {active ? (
          <>
            <SortArrow dir={view.dir} />
            <span className="sr-only">, {dirText(k, view.dir).toLowerCase()}</span>
          </>
        ) : (
          // Reserve the space so labels do not shift when the sort moves.
          <span className="inline-block w-[10px]" aria-hidden />
        )}
      </button>
    </span>
  );
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
