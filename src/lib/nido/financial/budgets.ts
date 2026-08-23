import type { HouseholdMemberView } from "../types.ts";
import { isDateInRange, type MonthRange } from "./dates.ts";
import { ratioPercent, roundMoney, sumMoney } from "./money.ts";
import { isActiveExpense, isPersonalExpense } from "./expenses.ts";
import { netExpense } from "./refunds.ts";
import type {
  BudgetConsumption,
  BudgetItemView,
  BudgetRow,
  ExpenseRow,
  MonthBudgetView,
} from "./types.ts";

/** Presentation-only. Terracotta attention in the design system; not stored. */
export const BUDGET_NEAR_LIMIT_PERCENT = 80;

export function isActiveBudget(budget: Pick<BudgetRow, "deletedAt">): boolean {
  return budget.deletedAt == null;
}

export function isNidoBudget(budget: Pick<BudgetRow, "memberId">): boolean {
  return budget.memberId == null;
}

export function isPersonalBudget(budget: Pick<BudgetRow, "memberId">): boolean {
  return budget.memberId != null;
}

export function canMutateBudget(
  budget: Pick<BudgetRow, "createdBy" | "deletedAt" | "memberId">,
  userId: string | null | undefined,
): boolean {
  if (!userId || budget.createdBy !== userId || budget.deletedAt != null) return false;
  if (budget.memberId != null && budget.memberId !== userId) return false;
  return true;
}

export function budgetsOverlappingRange(budgets: BudgetRow[], range: MonthRange): BudgetRow[] {
  return budgets.filter(
    (budget) =>
      isActiveBudget(budget) &&
      budget.startDate <= range.end &&
      budget.endDate >= range.start,
  );
}

export function nidoBudgetsForMonth(budgets: BudgetRow[], range: MonthRange): BudgetRow[] {
  return budgetsOverlappingRange(budgets, range).filter(isNidoBudget);
}

/**
 * Whether a live expense consumes this budget.
 *
 * Shared for every budget:
 * - same household, same category_id, date in the budget month
 * - deleted_at IS NULL
 * - only materialized expenses (recurring templates never appear here)
 *
 * Nido (`member_id` NULL): every visible expense in that set. Personal
 * expenses count when the viewer was allowed to SELECT them (D5 / RLS).
 *
 * Personal (`member_id` set): only that owner's `scope = personal` rows.
 * Shared expenses never consume a personal budget. Ownership is
 * `created_by` (same as `payer_id` on personal expenses). Splits are not
 * re-interpreted.
 *
 * Amounts are net of refunds belonging to those same expenses.
 * A refund never consumes another budget: it inherits category and
 * period from the parent expense (expense month, not refund date).
 */
export function expenseConsumesBudget(
  budget: Pick<BudgetRow, "householdId" | "categoryId" | "startDate" | "endDate" | "memberId">,
  expense: ExpenseRow,
): boolean {
  if (!isActiveExpense(expense)) return false;
  if (expense.householdId !== budget.householdId) return false;
  if (expense.categoryId !== budget.categoryId) return false;
  if (
    !isDateInRange(expense.occurredAt, {
      start: budget.startDate,
      end: budget.endDate,
    })
  ) {
    return false;
  }
  if (isPersonalBudget(budget)) {
    return isPersonalExpense(expense) && expense.createdBy === budget.memberId;
  }
  return true;
}

/**
 * Single source of truth for spent against a budget.
 * Sums confirmed expenses net of their refunds. Does not add
 * recurring_expenses templates. Does not persist.
 * See `expenseConsumesBudget` for Nido vs personal rules.
 */
export function budgetSpent(
  budget: Pick<BudgetRow, "householdId" | "categoryId" | "startDate" | "endDate" | "memberId">,
  expenses: ExpenseRow[],
): number {
  return sumMoney(
    expenses
      .filter((expense) => expenseConsumesBudget(budget, expense))
      .map((expense) => netExpense(expense.amount, expense.refunds)),
  );
}

/**
 * Deterministic consumption view. No I/O, no React.
 * `percentage` is unbounded (may exceed 100). `remaining` may be negative.
 */
export function calculateBudgetConsumption(
  budget: Pick<BudgetRow, "householdId" | "categoryId" | "startDate" | "endDate" | "memberId" | "amount">,
  expenses: ExpenseRow[],
): BudgetConsumption {
  const consumed = budgetSpent(budget, expenses);
  return {
    budgetAmount: budget.amount,
    consumed,
    remaining: budgetRemaining(budget.amount, consumed),
    percentage: budgetUsage(consumed, budget.amount),
  };
}

export function budgetRemaining(amount: number, spent: number): number {
  return roundMoney(amount - spent);
}

export function budgetUsage(spent: number, amount: number): number | null {
  return ratioPercent(spent, amount);
}

export function isBudgetOver(amount: number, spent: number): boolean {
  return amount > 0 && spent > amount;
}

export function isBudgetNearLimit(amount: number, spent: number): boolean {
  const percent = budgetUsage(spent, amount);
  return percent != null && percent >= BUDGET_NEAR_LIMIT_PERCENT && !isBudgetOver(amount, spent);
}

function budgetMemberName(
  memberId: string | null,
  members: HouseholdMemberView[] | undefined,
): string | null {
  if (!memberId) return null;
  return members?.find((member) => member.userId === memberId)?.displayName ?? null;
}

export function buildBudgetItemView(
  budget: BudgetRow,
  expenses: ExpenseRow[],
  members?: HouseholdMemberView[],
): BudgetItemView {
  const consumption = calculateBudgetConsumption(budget, expenses);
  return {
    id: budget.id,
    householdId: budget.householdId,
    categoryId: budget.categoryId,
    name: budget.category?.name?.trim() || "Categoría",
    icon: budget.category?.icon?.trim() || "📌",
    amount: consumption.budgetAmount,
    spent: consumption.consumed,
    remaining: consumption.remaining,
    usagePercent: consumption.percentage,
    over: isBudgetOver(consumption.budgetAmount, consumption.consumed),
    nearLimit: isBudgetNearLimit(consumption.budgetAmount, consumption.consumed),
    startDate: budget.startDate,
    endDate: budget.endDate,
    createdBy: budget.createdBy,
    deletedAt: budget.deletedAt,
    memberId: budget.memberId,
    memberName: budgetMemberName(budget.memberId, members),
  };
}

function sortPeriodBudgets(a: BudgetRow, b: BudgetRow): number {
  const byStart = b.startDate.localeCompare(a.startDate);
  if (byStart !== 0) return byStart;
  const nidoFirst = Number(isPersonalBudget(a)) - Number(isPersonalBudget(b));
  if (nidoFirst !== 0) return nidoFirst;
  const nameA = a.category?.name ?? "";
  const nameB = b.category?.name ?? "";
  return nameA.localeCompare(nameB, "es");
}

export function visiblePeriodBudgets(
  budgets: BudgetRow[],
  range: MonthRange,
  householdId?: string,
): BudgetRow[] {
  return budgetsOverlappingRange(budgets, range)
    .filter((budget) => householdId == null || budget.householdId === householdId)
    .slice()
    .sort(sortPeriodBudgets);
}

export function visibleNidoPeriodBudgets(
  budgets: BudgetRow[],
  range: MonthRange,
  householdId?: string,
): BudgetRow[] {
  return visiblePeriodBudgets(budgets, range, householdId).filter(isNidoBudget);
}

export function visiblePersonalPeriodBudgets(
  budgets: BudgetRow[],
  range: MonthRange,
  householdId?: string,
): BudgetRow[] {
  return visiblePeriodBudgets(budgets, range, householdId).filter(isPersonalBudget);
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
  const items = nidoBudgets.map((budget) => buildBudgetItemView(budget, periodExpenses));
  const totalBudget = sumMoney(nidoBudgets.map((budget) => budget.amount));
  const totalSpent = sumMoney(
    periodExpenses
      .filter(isActiveExpense)
      .map((expense) => netExpense(expense.amount, expense.refunds)),
  );
  const remaining = roundMoney(totalBudget - totalSpent);
  const over = totalBudget > 0 && totalSpent > totalBudget;

  const categories = items.map((item) => ({
    categoryId: item.categoryId,
    name: item.name,
    icon: item.icon,
    budget: item.amount,
    spent: item.spent,
  }));

  if (categories.length === 0) {
    const spentOnly = new Map<string, (typeof categories)[number]>();
    for (const expense of periodExpenses.filter(isActiveExpense)) {
      const existing = spentOnly.get(expense.categoryId);
      const spent = (existing?.spent ?? 0) + netExpense(expense.amount, expense.refunds);
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
    items,
  };
}

export function budgetCoversDate(budget: BudgetRow, isoDate: string): boolean {
  return isDateInRange(isoDate, { start: budget.startDate, end: budget.endDate });
}
