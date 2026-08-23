/**
 * Financial period helpers.
 *
 * "Este mes" is the calendar month in America/Mexico_City, not UTC.
 * Transaction columns (`occurred_at`, `contributed_at`, budget dates) are
 * Postgres `date` values (YYYY-MM-DD) with no time component — compare them
 * as inclusive calendar dates, never as UTC midnights.
 */

export const NIDO_TIMEZONE = "America/Mexico_City";

export type MonthRange = {
  /** Inclusive first day, YYYY-MM-DD */
  start: string;
  /** Inclusive last day, YYYY-MM-DD */
  end: string;
  year: number;
  /** 1–12 */
  month: number;
  /** e.g. "Agosto 2026" */
  label: string;
  timeZone: string;
};

export type ZonedDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
};

function partNumber(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): number {
  const value = parts.find((part) => part.type === type)?.value;
  return Number(value);
}

export function zonedDateParts(
  date: Date,
  timeZone: string = NIDO_TIMEZONE,
): ZonedDateParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  return {
    year: partNumber(parts, "year"),
    month: partNumber(parts, "month"),
    day: partNumber(parts, "day"),
    hour: partNumber(parts, "hour"),
  };
}

export function isoDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function formatMonthLabel(year: number, month: number): string {
  const utc = new Date(Date.UTC(year, month - 1, 1));
  const raw = new Intl.DateTimeFormat("es-MX", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(utc);
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export function getMonthRange(
  year: number,
  month: number,
  timeZone: string = NIDO_TIMEZONE,
): MonthRange {
  return {
    start: isoDate(year, month, 1),
    end: isoDate(year, month, daysInMonth(year, month)),
    year,
    month,
    label: formatMonthLabel(year, month),
    timeZone,
  };
}

export function getCurrentMonthRange(
  now: Date = new Date(),
  timeZone: string = NIDO_TIMEZONE,
): MonthRange {
  const { year, month } = zonedDateParts(now, timeZone);
  return getMonthRange(year, month, timeZone);
}

/** Shift a calendar month by `delta` months. Uses UTC year/month math, not local `Date`. */
export function shiftMonth(range: MonthRange, delta: number): MonthRange {
  const shifted = new Date(Date.UTC(range.year, range.month - 1 + delta, 1));
  return getMonthRange(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, range.timeZone);
}

export function isSameMonth(
  a: Pick<MonthRange, "year" | "month">,
  b: Pick<MonthRange, "year" | "month">,
): boolean {
  return a.year === b.year && a.month === b.month;
}

export function isDateInRange(iso: string, range: Pick<MonthRange, "start" | "end">): boolean {
  return iso >= range.start && iso <= range.end;
}

/** Calendar month that contains `iso`, or null if the date is invalid. */
export function monthRangeFromIsoDate(
  iso: string,
  timeZone: string = NIDO_TIMEZONE,
): MonthRange | null {
  if (!isCalendarDate(iso)) return null;
  const [year, month] = iso.split("-").map(Number);
  return getMonthRange(year, month, timeZone);
}

/** True when start/end are the inclusive first and last days of one calendar month. */
export function isCalendarMonthRange(start: string, end: string): boolean {
  const range = monthRangeFromIsoDate(start);
  return range != null && range.start === start && range.end === end;
}

/** Calendar date YYYY-MM-DD. Rejects impossible days such as 2026-02-31. */
export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || month < 1 || month > 12 || day < 1) return false;
  if (day > daysInMonth(year, month)) return false;
  return isoDate(year, month, day) === value;
}

/** Today's calendar date in the Nido timezone, not UTC. */
export function todayIso(
  now: Date = new Date(),
  timeZone: string = NIDO_TIMEZONE,
): string {
  const parts = zonedDateParts(now, timeZone);
  return isoDate(parts.year, parts.month, parts.day);
}

export type DayGreeting = "Buenos días" | "Buenas tardes" | "Buenas noches";

export function greetingForNow(
  now: Date = new Date(),
  timeZone: string = NIDO_TIMEZONE,
): DayGreeting {
  const { hour } = zonedDateParts(now, timeZone);
  if (hour < 12) return "Buenos días";
  if (hour < 19) return "Buenas tardes";
  return "Buenas noches";
}

/**
 * Relative label for activity rows. Uses the calendar date in the Nido
 * timezone. `createdAt` (timestamptz) is only used for same-day "Hace Nh".
 */
export function formatRelativeActivityDate(
  occurredOn: string,
  createdAt: string | null | undefined,
  now: Date = new Date(),
  timeZone: string = NIDO_TIMEZONE,
): string {
  const today = zonedDateParts(now, timeZone);
  const todayIso = isoDate(today.year, today.month, today.day);
  const yesterdayDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const yesterday = zonedDateParts(yesterdayDate, timeZone);
  const yesterdayIso = isoDate(yesterday.year, yesterday.month, yesterday.day);

  if (occurredOn === todayIso) {
    if (createdAt) {
      const created = new Date(createdAt);
      if (!Number.isNaN(created.getTime())) {
        const diffMs = now.getTime() - created.getTime();
        const hours = Math.floor(diffMs / (60 * 60 * 1000));
        if (hours >= 1 && hours < 24) return `Hace ${hours}h`;
        const minutes = Math.floor(diffMs / (60 * 1000));
        if (minutes >= 1 && minutes < 60) return `Hace ${minutes} min`;
      }
    }
    return "Hoy";
  }

  if (occurredOn === yesterdayIso) return "Ayer";

  const [year, month, day] = occurredOn.split("-").map(Number);
  if (!year || !month || !day) return occurredOn;

  const occurredUtc = Date.UTC(year, month - 1, day);
  const todayUtc = Date.UTC(today.year, today.month - 1, today.day);
  const diffDays = Math.round((todayUtc - occurredUtc) / (24 * 60 * 60 * 1000));
  if (diffDays > 1 && diffDays < 7) return `Hace ${diffDays} días`;

  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    year: year === today.year ? undefined : "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}
