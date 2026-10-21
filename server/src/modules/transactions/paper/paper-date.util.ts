/**
 * Strict calendar-date helpers for the Paper module.
 * Deliberately dependency-free so they can be unit-tested in isolation.
 */

/** Parses a strict YYYY-MM-DD string into a UTC-midnight Date, or null if it is malformed
 * or not a real calendar date (e.g. 2026-02-31, which Date.UTC would silently roll to March 3). */
export function parseStrictDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

export function addDaysUtc(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Today's calendar date in the given IANA timezone, as a UTC-midnight Date. */
export function getTodayInZone(now: Date, timeZone: string): Date {
  const iso = new Intl.DateTimeFormat('en-CA', { timeZone }).format(now);
  const parsed = parseStrictDate(iso);
  if (!parsed) {
    throw new Error(`Could not resolve today's date in ${timeZone}: ${iso}`);
  }
  return parsed;
}

/**
 * The single place that decides which paper may be generated right now
 * ("current business day only", no future generation).
 * order_date = today in the business timezone; sale_date = order_date + saleOffsetDays.
 */
export function resolveGenerationDates(
  now: Date,
  timeZone: string,
  saleOffsetDays: number,
): { orderDate: Date; saleDate: Date } {
  const orderDate = getTodayInZone(now, timeZone);
  return { orderDate, saleDate: addDaysUtc(orderDate, saleOffsetDays) };
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // Asia/Kolkata (DATE_CONFIG.TIMEZONE) has no DST
/** UTC instants [start, end) of the IST calendar day for a UTC-midnight calendar date. */
export function istDayBoundsUtc(calendarDate: Date): {
  start: Date;
  end: Date;
} {
  const start = new Date(calendarDate.getTime() - IST_OFFSET_MS);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}
