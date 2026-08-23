import type { HouseholdMemberView } from "../types.ts";
import { buildActivityItems } from "./activity.ts";
import { buildBudgetItemView, buildMonthBudgetView, visiblePeriodBudgets } from "./budgets.ts";
import { greetingForNow, type MonthRange } from "./dates.ts";
import { householdSpent, isActiveExpense, visiblePeriodExpenses } from "./expenses.ts";
import {
  activeGoalProgress,
  emergencyMonthsCovered,
  featuredSavingGoal,
  isActiveContribution,
} from "./goals.ts";
import { computeHealth } from "./health.ts";
import { isActiveIncome, periodIncomeTotal, visiblePeriodIncomes } from "./incomes.ts";
import { clampedPercent } from "./money.ts";
import type { DashboardSnapshot, DashboardViewModel, FeaturedGoalView } from "./types.ts";

const ACTIVITY_FEED = 20;

export function buildDashboardViewModel(input: {
  snapshot: DashboardSnapshot;
  members: HouseholdMemberView[];
  range: MonthRange;
  now?: Date;
}): DashboardViewModel {
  const { snapshot, members, range, now = new Date() } = input;
  const periodIncomes = visiblePeriodIncomes(
    snapshot.periodIncomes,
    range,
    snapshot.householdId,
  );
  const periodIncome = periodIncomeTotal(periodIncomes);
  const periodExpenses = visiblePeriodExpenses(
    snapshot.periodExpenses,
    range,
    snapshot.householdId,
  );
  const recentExpenses = snapshot.expenses.filter(
    (row) => isActiveExpense(row) && row.householdId === snapshot.householdId,
  );
  const recentIncomes = snapshot.incomes.filter(
    (row) => isActiveIncome(row) && row.householdId === snapshot.householdId,
  );
  const periodSpent = householdSpent(periodExpenses);
  const activeGoals = activeGoalProgress(snapshot.goals);
  const featured = featuredSavingGoal(snapshot.goals);
  const emergencyMonths = featured
    ? emergencyMonthsCovered(featured.contributed, periodSpent)
    : null;

  const hasAnyFinancialData =
    periodIncomes.length > 0 ||
    periodExpenses.length > 0 ||
    recentIncomes.length > 0 ||
    recentExpenses.length > 0 ||
    snapshot.goals.length > 0 ||
    snapshot.contributions.filter(isActiveContribution).length > 0 ||
    snapshot.budgets.length > 0;

  const periodBudgetRows = visiblePeriodBudgets(
    snapshot.budgets,
    range,
    snapshot.householdId,
  );
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

  const activityExpenses = [...snapshot.periodExpenses, ...snapshot.expenses].filter(
    (row, index, rows) => rows.findIndex((item) => item.id === row.id) === index,
  );
  const activity = buildActivityItems({
    expenses: activityExpenses,
    incomes: snapshot.incomes,
    contributions: snapshot.contributions,
    goals: snapshot.goals,
    members,
    householdId: snapshot.householdId,
    limit: ACTIVITY_FEED,
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
    periodIncomes,
    recentExpenses,
    recentIncomes,
    periodBudgets: periodBudgetRows.map((row) =>
      buildBudgetItemView(row, periodExpenses, members),
    ),
    activity,
    empty: {
      expenses: periodExpenses.length === 0 && recentExpenses.length === 0,
      incomes: periodIncomes.length === 0 && recentIncomes.length === 0,
      goals: activeGoals.length === 0,
      activity: activity.length === 0,
      budget:
        !budget.hasBudget &&
        periodBudgetRows.length === 0 &&
        budget.totalSpent === 0,
    },
  };
}
