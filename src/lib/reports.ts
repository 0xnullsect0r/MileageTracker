/**
 * Pure helpers for the CSV export. Kept out of the route file so the tests
 * can import them without spinning up Next.
 */

export interface Period {
  from: string; // YYYY-MM-DD, inclusive
  to: string;   // YYYY-MM-DD, inclusive
  /** Filename suffix — "2024", "2024-08", or "2024-08-01_2024-08-15". */
  suffix: string;
}

export interface RangeInput {
  range?: string | null;
  year?: string | null;
  from?: string | null;
  to?: string | null;
  now?: Date;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_YEAR = /^\d{4}$/;

/**
 * Precedence: an explicit from/to wins, then a named range, then a year,
 * then the current year. Invalid params fall through to the next step — the
 * export is a read-only convenience and should not 400 on a malformed link.
 */
export function resolveRange(p: RangeInput): Period {
  const now = p.now ?? new Date();

  if (p.from && p.to && ISO_DATE.test(p.from) && ISO_DATE.test(p.to) && p.from <= p.to) {
    return { from: p.from, to: p.to, suffix: `${p.from}_${p.to}` };
  }

  if (p.range === "last-month") {
    const { from, to } = lastMonthRange(now);
    return { from, to, suffix: from.slice(0, 7) };
  }

  const year = p.year && ISO_YEAR.test(p.year) ? p.year : String(now.getFullYear());
  return { from: `${year}-01-01`, to: `${year}-12-31`, suffix: year };
}

/**
 * The previous calendar month, relative to `today` in the server's local
 * timezone (set by the TZ env var in compose). "Last month" on Sep 17 means
 * Aug 1–Aug 31, not "the last 30 days" — a tax reader expects month bounds.
 */
export function lastMonthRange(today: Date): { from: string; to: string } {
  const y = today.getFullYear();
  const m = today.getMonth();
  const prevY = m === 0 ? y - 1 : y;
  const prevM = m === 0 ? 11 : m - 1;
  const mm = String(prevM + 1).padStart(2, "0");
  const lastDay = new Date(prevY, prevM + 1, 0).getDate();
  const dd = String(lastDay).padStart(2, "0");
  return { from: `${prevY}-${mm}-01`, to: `${prevY}-${mm}-${dd}` };
}
