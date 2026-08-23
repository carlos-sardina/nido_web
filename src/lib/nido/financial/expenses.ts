import { isDateInRange, type MonthRange } from "./dates.ts";
import { roundMoney, sumMoney } from "./money.ts";
import { expenseHasRefunds, netExpense } from "./refunds.ts";
import type { ExpenseRow, ExpenseSplitRow } from "./types.ts";

export function isActiveExpense(expense: Pick<ExpenseRow, "deletedAt">): boolean {
  return expense.deletedAt == null;
}

export function canMutateExpense(
  expense: Pick<ExpenseRow, "createdBy" | "deletedAt">,
  userId: string | null | undefined,
): boolean {
  return Boolean(userId) && expense.createdBy === userId && expense.deletedAt == null;
}

export function canEditExpense(
  expense: Pick<ExpenseRow, "createdBy" | "deletedAt" | "refunds">,
  userId: string | null | undefined,
): boolean {
  return canMutateExpense(expense, userId) && !expenseHasRefunds(expense);
}

export function canRefundExpense(
  expense: Pick<ExpenseRow, "createdBy" | "deletedAt" | "amount" | "refunds">,
  userId: string | null | undefined,
): boolean {
  return canMutateExpense(expense, userId) && netExpense(expense.amount, expense.refunds) > 0;
}

export function expensesInRange(expenses: ExpenseRow[], range: MonthRange): ExpenseRow[] {
  return expenses.filter(
    (expense) => isActiveExpense(expense) && isDateInRange(expense.occurredAt, range),
  );
}

/**
 * Confirmed expenses of the current period for Gastos / totals.
 * Soft-deleted rows are excluded. Newest date first, then newest created_at.
 */
export function visiblePeriodExpenses(
  expenses: ExpenseRow[],
  range: MonthRange,
  householdId?: string,
): ExpenseRow[] {
  return expensesInRange(expenses, range)
    .filter((expense) => householdId == null || expense.householdId === householdId)
    .slice()
    .sort((a, b) => {
      const byDate = b.occurredAt.localeCompare(a.occurredAt);
      if (byDate !== 0) return byDate;
      return b.createdAt.localeCompare(a.createdAt);
    });
}

/**
 * Household outflow for a period: confirmed expenses net of their refunds.
 * Recurring templates are not included. Soft-deleted rows are excluded,
 * so their refunds are not subtracted either.
 */
export function householdSpent(expenses: ExpenseRow[]): number {
  return sumMoney(
    expenses
      .filter(isActiveExpense)
      .map((expense) => netExpense(expense.amount, expense.refunds)),
  );
}

/**
 * Amount attributed to a member via expense_splits.
 * Do not use expenses.amount for a member's share when splits exist.
 */
export function memberOwed(splits: ExpenseSplitRow[], memberId: string): number {
  return sumMoney(
    splits.filter((split) => split.memberId === memberId).map((split) => split.amount),
  );
}

export function memberPaid(expenses: ExpenseRow[], memberId: string): number {
  return sumMoney(
    expenses
      .filter((expense) => isActiveExpense(expense) && expense.payerId === memberId)
      .map((expense) => expense.amount),
  );
}

export function memberBalance(expenses: ExpenseRow[], memberId: string): number {
  const splits = expenses.flatMap((expense) => (isActiveExpense(expense) ? expense.splits : []));
  return roundMoney(memberPaid(expenses, memberId) - memberOwed(splits, memberId));
}

export function spentByCategory(expenses: ExpenseRow[], categoryId: string): number {
  return sumMoney(
    expenses
      .filter((expense) => isActiveExpense(expense) && expense.categoryId === categoryId)
      .map((expense) => netExpense(expense.amount, expense.refunds)),
  );
}

export function isRecurringExpense(expense: Pick<ExpenseRow, "recurringId">): boolean {
  return expense.recurringId != null;
}

export function isPersonalExpense(expense: Pick<ExpenseRow, "scope">): boolean {
  return expense.scope === "personal";
}
