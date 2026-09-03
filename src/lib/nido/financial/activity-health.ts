import type { ActivityScopeFilter } from "./activity.ts";
import { isNidoBudget, isPersonalBudget } from "./budgets.ts";
import { householdSpent, isPersonalExpense, isSharedExpense } from "./expenses.ts";
import { computeHealth } from "./health.ts";
import { periodIncomeTotal } from "./incomes.ts";
import { sumMoney } from "./money.ts";
import type { BudgetItemView, ExpenseRow, GoalRow, HealthView, IncomeRow } from "./types.ts";

export type ActivityScopeHealth = {
  incomeThisMonth: number;
  spentThisMonth: number;
  health: HealthView;
};

type BudgetAmount = Pick<BudgetItemView, "amount" | "memberId">;

export type ActivityScopeHealthInput = {
  filter: ActivityScopeFilter;
  viewerId: string | null | undefined;
  household: {
    income: number;
    spent: number;
    health: HealthView;
    emergencyMonths: number | null;
  };
  periodExpenses: readonly ExpenseRow[];
  periodIncomes: readonly IncomeRow[];
  periodBudgets: readonly BudgetAmount[];
  goals: readonly GoalRow[];
};

function budgetTotal(budgets: readonly BudgetAmount[]): number {
  return sumMoney(budgets.map((budget) => budget.amount));
}

function ownPersonalExpenses(
  expenses: readonly ExpenseRow[],
  viewerId: string,
): ExpenseRow[] {
  return expenses.filter(
    (expense) => isPersonalExpense(expense) && expense.payerId === viewerId,
  );
}

/**
 * Activity wellness for Todo / Compartido / Personal.
 *
 * Todo reuses the household score. Compartido keeps household income
 * (there is no shared income) and scores only shared spend against the
 * Nido plan and shared backup fund. Personal scores the viewer's own
 * income, personal spend, and personal budgets. Personal funds never
 * enter emergency months.
 */
export function computeActivityScopeHealth(
  input: ActivityScopeHealthInput,
): ActivityScopeHealth {
  if (input.filter === "all") {
    return {
      incomeThisMonth: input.household.income,
      spentThisMonth: input.household.spent,
      health: input.household.health,
    };
  }

  if (input.filter === "shared") {
    const spentThisMonth = householdSpent(input.periodExpenses.filter(isSharedExpense));
    const budgetTotalNido = budgetTotal(input.periodBudgets.filter(isNidoBudget));
    const activeGoalCount = input.goals.filter(
      (goal) => goal.status === "active" && goal.scope === "shared",
    ).length;
    const hasSlice =
      spentThisMonth > 0 ||
      budgetTotalNido > 0 ||
      input.household.emergencyMonths != null;
    return {
      incomeThisMonth: input.household.income,
      spentThisMonth,
      health: computeHealth({
        incomeThisMonth: input.household.income,
        spentThisMonth,
        budgetTotal: budgetTotalNido,
        activeGoalCount,
        emergencyMonths: input.household.emergencyMonths,
        hasAnyFinancialData: hasSlice,
      }),
    };
  }

  const viewerId = input.viewerId;
  if (!viewerId) {
    return {
      incomeThisMonth: 0,
      spentThisMonth: 0,
      health: { available: false },
    };
  }

  const spentThisMonth = householdSpent(ownPersonalExpenses(input.periodExpenses, viewerId));
  const incomeThisMonth = periodIncomeTotal(
    input.periodIncomes.filter((income) => income.memberId === viewerId),
  );
  const personalBudgetTotal = budgetTotal(
    input.periodBudgets.filter(
      (budget) => isPersonalBudget(budget) && budget.memberId === viewerId,
    ),
  );
  const activeGoalCount = input.goals.filter(
    (goal) =>
      goal.status === "active" &&
      goal.scope === "personal" &&
      goal.createdBy === viewerId,
  ).length;
  const hasSlice = incomeThisMonth > 0 || spentThisMonth > 0 || personalBudgetTotal > 0;

  return {
    incomeThisMonth,
    spentThisMonth,
    health: computeHealth({
      incomeThisMonth,
      spentThisMonth,
      budgetTotal: personalBudgetTotal,
      activeGoalCount,
      emergencyMonths: null,
      hasAnyFinancialData: hasSlice,
    }),
  };
}
