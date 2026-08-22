import { isDateInRange, type MonthRange } from "./dates.ts";
import { sumMoney } from "./money.ts";
import type { IncomeRow, RecurringIncomeRow } from "./types.ts";

export function isActiveIncome(income: Pick<IncomeRow, "deletedAt">): boolean {
  return income.deletedAt == null;
}

export function canMutateIncome(
  income: Pick<IncomeRow, "createdBy" | "deletedAt">,
  userId: string | null | undefined,
): boolean {
  return Boolean(userId) && income.createdBy === userId && income.deletedAt == null;
}

/**
 * Confirmed incomes of the current period for Ingresos / totals.
 * Soft-deleted rows are excluded. Newest date first, then newest created_at.
 */
export function visiblePeriodIncomes(
  incomes: IncomeRow[],
  range: MonthRange,
  householdId?: string,
): IncomeRow[] {
  return incomesInRange(incomes, range)
    .filter((income) => householdId == null || income.householdId === householdId)
    .slice()
    .sort((a, b) => {
      const byDate = b.occurredAt.localeCompare(a.occurredAt);
      if (byDate !== 0) return byDate;
      return b.createdAt.localeCompare(a.createdAt);
    });
}

export function incomesInRange(incomes: IncomeRow[], range: MonthRange): IncomeRow[] {
  return incomes.filter(
    (income) => isActiveIncome(income) && isDateInRange(income.occurredAt, range),
  );
}

/**
 * Confirmed income in a period. Recurring templates (`recurring_incomes`)
 * are not transactions and must not be added on top of confirmed rows —
 * a confirmed occurrence already has `incomes.recurring_id` set.
 */
export function periodIncomeTotal(incomes: IncomeRow[]): number {
  return sumMoney(incomes.filter(isActiveIncome).map((income) => income.amount));
}

/**
 * Confirmed incomes of one member in a calendar month.
 * Soft-deleted rows are excluded. Recurring templates are not a source.
 */
export function memberPeriodIncomeTotal(
  incomes: readonly IncomeRow[],
  memberId: string,
  range: MonthRange,
  householdId?: string,
): number {
  if (!memberId) return 0;
  return periodIncomeTotal(
    incomesInRange([...incomes], range).filter(
      (income) =>
        income.memberId === memberId &&
        (householdId == null || income.householdId === householdId),
    ),
  );
}

export function isOneTimeIncome(income: Pick<IncomeRow, "recurringId">): boolean {
  return income.recurringId == null;
}

export function isConfirmedFromRecurring(income: Pick<IncomeRow, "recurringId">): boolean {
  return income.recurringId != null;
}

export function isRecurringIncomeActiveOn(
  rule: RecurringIncomeRow,
  onIsoDate: string,
): boolean {
  if (!rule.isActive) return false;
  if (rule.endDate != null && rule.endDate < onIsoDate) return false;
  return true;
}

/** Basis for income-based splits: active recurring rules, never one-time incomes. */
export function activeRecurringIncomeBasis(
  rules: RecurringIncomeRow[],
  onIsoDate: string,
): number {
  return sumMoney(
    rules
      .filter((rule) => isRecurringIncomeActiveOn(rule, onIsoDate))
      .map((rule) => rule.amount),
  );
}
