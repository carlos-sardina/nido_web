import { daysInMonth, isCalendarDate, isoDate, todayIso } from "./dates.ts";
import type { RecurrenceFrequency } from "./types.ts";

export const RECURRENCE_FREQUENCIES: readonly RecurrenceFrequency[] = [
  "weekly",
  "biweekly",
  "monthly",
  "yearly",
];

export const FREQUENCY_LABELS: Record<RecurrenceFrequency, string> = {
  weekly: "Semanal",
  biweekly: "Quincenal",
  monthly: "Mensual",
  yearly: "Anual",
};

export type RecurrenceStatus = "active" | "paused" | "ended";

export function isRecurrenceFrequency(value: string | null | undefined): value is RecurrenceFrequency {
  return value === "weekly" || value === "biweekly" || value === "monthly" || value === "yearly";
}

export function frequencyLabel(frequency: RecurrenceFrequency): string {
  return FREQUENCY_LABELS[frequency];
}

function addCalendarDays(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const utc = Date.UTC(year, month - 1, day + days);
  const next = new Date(utc);
  return isoDate(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
}

function clampDay(year: number, month: number, day: number): string {
  const last = daysInMonth(year, month);
  return isoDate(year, month, Math.min(Math.max(day, 1), last));
}

/**
 * Advances a calendar date using the schema enum.
 * Monthly/yearly clamp to the last day of the target month.
 */
export function addRecurrencePeriod(
  iso: string,
  frequency: RecurrenceFrequency,
  dayOfMonth?: number | null,
): string | null {
  if (!isCalendarDate(iso) || !isRecurrenceFrequency(frequency)) return null;

  if (frequency === "weekly") return addCalendarDays(iso, 7);
  if (frequency === "biweekly") return addCalendarDays(iso, 14);

  const [year, month, day] = iso.split("-").map(Number);
  const preferred = dayOfMonth && dayOfMonth >= 1 && dayOfMonth <= 31 ? dayOfMonth : day;

  if (frequency === "monthly") {
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    return clampDay(nextYear, nextMonth, preferred);
  }

  return clampDay(year + 1, month, preferred);
}

export function recurrenceStatus(input: {
  isActive: boolean;
  nextOccurrence: string;
  endDate?: string | null;
  today?: string;
}): RecurrenceStatus {
  if (!input.isActive) return "paused";
  const today = input.today ?? todayIso();
  if (input.endDate && input.endDate < today) return "ended";
  if (input.endDate && input.nextOccurrence > input.endDate) return "ended";
  return "active";
}

export function isRecurrenceDue(input: {
  isActive: boolean;
  nextOccurrence: string;
  endDate?: string | null;
  today?: string;
}): boolean {
  if (recurrenceStatus(input) !== "active") return false;
  const today = input.today ?? todayIso();
  return isCalendarDate(input.nextOccurrence) && input.nextOccurrence <= today;
}

export function canMutateRecurrence(
  row: Pick<{ createdBy: string }, "createdBy">,
  userId: string | null | undefined,
): boolean {
  return Boolean(userId) && row.createdBy === userId;
}

export function recurrenceStatusLabel(status: RecurrenceStatus): string {
  if (status === "paused") return "Pausada";
  if (status === "ended") return "Finalizada";
  return "Activa";
}
