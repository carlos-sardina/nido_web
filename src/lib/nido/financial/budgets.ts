import { isDateInRange, type MonthRange } from "./dates.ts";
import { ratioPercent, roundMoney, sumMoney } from "./money.ts";
import { spentByCategory } from "./expenses.ts";
import type { BudgetCategoryView, BudgetRow, ExpenseRow, MonthBudgetView } from "./types.ts";

export function isNidoBudget(budget: Pick<BudgetRow, "memberId">): boolean {
  return budget.memberId == null;
}

export function budgetsOverlappingRange(budgets: BudgetRow[], range: MonthRange): BudgetRow[] {
  return budgets.filter(
    (budget) => budget.startDate <= range.end && budget.endDate >= range.start,
  );
}

export function nidoBudgetsForMonth(budgets: BudgetRow[], range: MonthRange): BudgetRow[] {
  return budgetsOverlappingRange(budgets, range).filter(isNidoBudget);
}

/**
 * Budget.amount is a planning target, not a spending cap.
 * Spent is derived from confirmed expenses in the same category and period.
 * There is no current_spent column.
 */
export function buildMonthBudgetView(
  budgets: BudgetRow[],
  periodExpenses: ExpenseRow[],
  range: MonthRange,
): MonthBudgetView {
  const nidoBudgets = nidoBudgetsForMonth(budgets, range);
  const totalBudget = sumMoney(nidoBudgets.map((budget) => budget.amount));
  const totalSpent = sumMoney(periodExpenses.map((expense) => expense.amount));
  const remaining = roundMoney(totalBudget - totalSpent);
  const over = totalBudget > 0 && totalSpent > totalBudget;

  const categories: BudgetCategoryView[] = nidoBudgets.map((budget) => ({
    categoryId: budget.categoryId,
    name: budget.category?.name?.trim() || "Categoría",
    icon: budget.category?.icon?.trim() || "📌",
    budget: budget.amount,
    spent: spentByCategory(periodExpenses, budget.categoryId),
  }));

  if (categories.length === 0) {
    const spentOnly = new Map<string, BudgetCategoryView>();
    for (const expense of periodExpenses) {
      const existing = spentOnly.get(expense.categoryId);
      const spent = (existing?.spent ?? 0) + expense.amount;
      spentOnly.set(expense.categoryId, {
        categoryId: expense.categoryId,
        name: expense.category?.name?.trim() || "Categoría",
        icon: expense.category?.icon?.trim() || "📌",
        budget: 0,
        spent,
      });
    }
    categories.push(...spentOnly.values());
  }

  return {
    hasBudget: totalBudget > 0,
    totalBudget,
    totalSpent,
    remaining,
    over,
    usagePercent: ratioPercent(totalSpent, totalBudget),
    categories,
  };
}

export function budgetCoversDate(budget: BudgetRow, isoDate: string): boolean {
  return isDateInRange(isoDate, { start: budget.startDate, end: budget.endDate });
}
