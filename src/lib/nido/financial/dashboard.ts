import type { HouseholdMemberView } from "../types.ts";
import { buildActivityItems } from "./activity.ts";
import { buildMonthBudgetView } from "./budgets.ts";
import { greetingForNow, type MonthRange } from "./dates.ts";
import { householdSpent, isActiveExpense, visiblePeriodExpenses } from "./expenses.ts";
import {
  activeGoalProgress,
  emergencyMonthsCovered,
  featuredSavingGoal,
  isActiveContribution,
} from "./goals.ts";
import { computeHealth } from "./health.ts";
import { periodIncomeTotal } from "./incomes.ts";
import { clampedPercent } from "./money.ts";
import type { DashboardSnapshot, DashboardViewModel, FeaturedGoalView } from "./types.ts";

const ACTIVITY_PREVIEW = 3;

export function buildDashboardViewModel(input: {
  snapshot: DashboardSnapshot;
  members: HouseholdMemberView[];
  range: MonthRange;
  now?: Date;
}): DashboardViewModel {
  const { snapshot, members, range, now = new Date() } = input;
  const periodIncome = periodIncomeTotal(snapshot.periodIncomes);
  const periodExpenses = visiblePeriodExpenses(
    snapshot.periodExpenses,
    range,
    snapshot.householdId,
  );
  const recentExpenses = snapshot.expenses.filter(isActiveExpense);
  const periodSpent = householdSpent(periodExpenses);
  const activeGoals = activeGoalProgress(snapshot.goals);
  const featured = featuredSavingGoal(snapshot.goals);
  const emergencyMonths = featured
    ? emergencyMonthsCovered(featured.contributed, periodSpent)
    : null;

  const hasAnyFinancialData =
    snapshot.periodIncomes.length > 0 ||
    periodExpenses.length > 0 ||
    snapshot.incomes.length > 0 ||
    recentExpenses.length > 0 ||
    snapshot.goals.length > 0 ||
    snapshot.contributions.filter(isActiveContribution).length > 0 ||
    snapshot.budgets.length > 0;

  const budget = buildMonthBudgetView(snapshot.budgets, periodExpenses, range);
  const health = computeHealth({
    incomeThisMonth: periodIncome,
    spentThisMonth: periodSpent,
    budgetTotal: budget.totalBudget,
    activeGoalCount: activeGoals.length,
    emergencyMonths,
    hasAnyFinancialData,
  });

  const featuredGoal: FeaturedGoalView | null = featured
    ? {
        id: featured.id,
        name: featured.name,
        contributed: featured.contributed,
        targetAmount: featured.targetAmount,
        percent: featured.invalidTarget
          ? 0
          : clampedPercent(featured.contributed, featured.targetAmount),
        invalidTarget: featured.invalidTarget,
        emergencyMonths,
      }
    : null;

  const activity = buildActivityItems({
    expenses: snapshot.expenses,
    incomes: snapshot.incomes,
    contributions: snapshot.contributions,
    goals: snapshot.goals,
    members,
    limit: ACTIVITY_PREVIEW,
  });

  return {
    range,
    greeting: greetingForNow(now, range.timeZone),
    periodIncome,
    periodSpent,
    hasAnyFinancialData,
    health,
    budget,
    featuredGoal,
    activeGoals,
    goals: snapshot.goals.filter((goal) => goal.status !== "archived"),
    periodExpenses,
    activity,
    empty: {
      expenses: periodExpenses.length === 0 && recentExpenses.length === 0,
      incomes: snapshot.periodIncomes.length === 0 && snapshot.incomes.length === 0,
      goals: activeGoals.length === 0,
      activity: activity.length === 0,
      budget: !budget.hasBudget && budget.totalSpent === 0,
    },
  };
}
