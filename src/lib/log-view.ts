/**
 * How the log is sorted and filtered, and how that survives in the URL — so
 * opening an entry and coming back lands on the same view.
 *
 * Pure: the table imports it on the client, the page parses with it on the
 * server, and the tests drive it directly.
 */

export const SORT_KEYS = [
  "date",
  "reading",
  "distance",
  "category",
  "description",
  "price",
  "qty",
  "cost",
  "economy",
] as const;

export type SortKey = (typeof SORT_KEYS)[number];
export type SortDir = "asc" | "desc";

export interface LogView {
  sort: SortKey;
  dir: SortDir;
  q: string;
  year: string; // "all" or YYYY
  cats: string[];
  from: string; // YYYY-MM-DD or ""
  to: string;
  reviewOnly: boolean;
}

export const DEFAULT_VIEW: LogView = {
  sort: "date",
  dir: "desc",
  q: "",
  year: "all",
  cats: [],
  from: "",
  to: "",
  reviewOnly: false,
};

/** Text columns read A→Z first; dates and figures read biggest first. */
export function defaultDir(key: SortKey): SortDir {
  return key === "category" || key === "description" ? "asc" : "desc";
}

export interface ViewRow {
  occurredOn: string;
  readingTicks: number | null;
  distanceTicks: number | null;
  description: string | null;
  categoryCode: string | null;
  categoryName: string | null;
  fuelQty: number | null;
  pricePerUnit: number | null;
  cost: number | null;
  economy: number | null;
  needsReview: boolean;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export function parseView(params: Params): LogView {
  const sort = one(params.sort);
  const dir = one(params.dir);
  const year = one(params.year);
  const from = one(params.from);
  const to = one(params.to);
  const key: SortKey = (SORT_KEYS as readonly string[]).includes(sort) ? (sort as SortKey) : DEFAULT_VIEW.sort;
  return {
    sort: key,
    dir: dir === "asc" || dir === "desc" ? dir : defaultDir(key),
    q: one(params.q).slice(0, 200),
    year: /^\d{4}$/.test(year) ? year : "all",
    cats: one(params.cat).split(",").filter(Boolean),
    from: ISO_DATE.test(from) ? from : "",
    to: ISO_DATE.test(to) ? to : "",
    reviewOnly: one(params.review) === "1",
  };
}

/** Only what differs from the default, so a plain log keeps a plain URL. */
export function viewToSearch(view: LogView): string {
  const p = new URLSearchParams();
  if (view.sort !== DEFAULT_VIEW.sort || view.dir !== DEFAULT_VIEW.dir) {
    p.set("sort", view.sort);
    if (view.dir !== defaultDir(view.sort)) p.set("dir", view.dir);
  }
  if (view.q.trim()) p.set("q", view.q.trim());
  if (view.year !== "all") p.set("year", view.year);
  if (view.cats.length) p.set("cat", view.cats.join(","));
  if (view.from) p.set("from", view.from);
  if (view.to) p.set("to", view.to);
  if (view.reviewOnly) p.set("review", "1");
  const s = p.toString();
  return s ? `?${s}` : "";
}

export function isFiltered(view: LogView): boolean {
  return (
    view.q.trim() !== "" ||
    view.year !== "all" ||
    view.cats.length > 0 ||
    view.from !== "" ||
    view.to !== "" ||
    view.reviewOnly
  );
}

/** Rows that pass every filter, in the order they came in. */
export function filterRows<T extends ViewRow>(rows: readonly T[], view: LogView): T[] {
  const q = view.q.trim().toLowerCase();
  const cats = new Set(view.cats);
  // A range typed backwards still means the days between the two.
  const [from, to] = view.from && view.to && view.from > view.to ? [view.to, view.from] : [view.from, view.to];
  return rows.filter((r) => {
    if (view.reviewOnly && !r.needsReview) return false;
    if (view.year !== "all" && !r.occurredOn.startsWith(view.year)) return false;
    if (from && r.occurredOn < from) return false;
    if (to && r.occurredOn > to) return false;
    if (cats.size > 0 && (r.categoryCode === null || !cats.has(r.categoryCode))) return false;
    if (q && !`${r.description ?? ""}\n${r.categoryName ?? ""}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

function keyOf(r: ViewRow, key: SortKey): number | string | null {
  switch (key) {
    case "date":
      return null; // handled by position
    case "reading":
      return r.readingTicks;
    case "distance":
      return r.distanceTicks;
    case "category":
      return r.categoryCode;
    case "description":
      return r.description?.trim() || null;
    case "price":
      return r.pricePerUnit;
    case "qty":
      return r.fuelQty;
    case "cost":
      return r.cost;
    case "economy":
      return r.economy;
  }
}

/**
 * Sort rows that arrive in log order (date, then reading, then entry time).
 *
 * Date order is that log order, forwards or backwards, so two entries on one
 * day keep their odometer sequence. Every other column puts blanks last in
 * either direction — a cost sort is about the entries that have a cost — and
 * breaks ties newest first.
 */
export function sortRows<T extends ViewRow>(rows: readonly T[], sort: SortKey, dir: SortDir): T[] {
  const indexed = rows.map((row, i) => ({ row, i }));
  const sign = dir === "asc" ? 1 : -1;
  if (sort === "date") {
    indexed.sort((a, b) => sign * (a.i - b.i));
    return indexed.map((x) => x.row);
  }
  const collator = new Intl.Collator("en-US", { sensitivity: "base", numeric: true });
  indexed.sort((a, b) => {
    const ka = keyOf(a.row, sort);
    const kb = keyOf(b.row, sort);
    if (ka === null && kb === null) return b.i - a.i;
    if (ka === null) return 1;
    if (kb === null) return -1;
    const c = typeof ka === "string" ? collator.compare(ka, kb as string) : (ka as number) - (kb as number);
    return c !== 0 ? sign * c : b.i - a.i;
  });
  return indexed.map((x) => x.row);
}
