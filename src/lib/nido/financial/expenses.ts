import { isDateInRange, type MonthRange } from "./dates.ts";
import { roundMoney, sumMoney } from "./money.ts";
import type { ExpenseRow, ExpenseSplitRow } from "./types.ts";

export function isActiveExpense(expense: Pick<ExpenseRow, "deletedAt">): boolean {
  return expense.deletedAt == null;
}

export function expensesInRange(expenses: ExpenseRow[], range: MonthRange): ExpenseRow[] {
  return expenses.filter(
    (expense) => isActiveExpense(expense) && isDateInRange(expense.occurredAt, range),
  );
}

/**
 * Household outflow for a period: the confirmed expense total.
 * Recurring templates are not included. Soft-deleted rows are excluded.
 */
export function householdSpent(expenses: ExpenseRow[]): number {
  return sumMoney(expenses.filter(isActiveExpense).map((expense) => expense.amount));
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
      .map((expense) => expense.amount),
  );
}

export function isRecurringExpense(expense: Pick<ExpenseRow, "recurringId">): boolean {
  return expense.recurringId != null;
}

export function isPersonalExpense(expense: Pick<ExpenseRow, "scope">): boolean {
  return expense.scope === "personal";
}
