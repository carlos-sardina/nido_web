import { clampedPercent, goalProgressRatio, moneyOrZero, sumMoney } from "./money.ts";
import type { GoalContributionRow, GoalProgress, GoalRow } from "./types.ts";

export function contributionsTotal(contributions: GoalContributionRow[]): number {
  return sumMoney(contributions.map((row) => row.amount));
}

export function goalProgress(goal: GoalRow): GoalProgress {
  const contributed = contributionsTotal(goal.contributions);
  const targetAmount = moneyOrZero(goal.targetAmount);
  const invalidTarget = !(targetAmount > 0);
  const ratio = goalProgressRatio(contributed, targetAmount);
  const completed =
    goal.status === "completed" || (!invalidTarget && contributed >= targetAmount);

  return {
    id: goal.id,
    name: goal.name,
    goalType: goal.goalType,
    status: goal.status,
    targetAmount,
    contributed,
    ratio,
    percent: invalidTarget ? 0 : clampedPercent(contributed, targetAmount),
    targetDate: goal.targetDate,
    invalidTarget,
    completed,
  };
}

export function activeGoalProgress(goals: GoalRow[]): GoalProgress[] {
  return goals
    .filter((goal) => goal.status === "active")
    .map(goalProgress);
}

const EMERGENCY_NAME = /emergenc/i;

export function featuredSavingGoal(goals: GoalRow[]): GoalProgress | null {
  const active = activeGoalProgress(goals);
  if (active.length === 0) return null;
  const emergency = active.find((goal) => EMERGENCY_NAME.test(goal.name));
  if (emergency) return emergency;
  const saving = active.find((goal) => goal.goalType === "saving");
  return saving ?? active[0];
}

export function emergencyMonthsCovered(
  contributed: number,
  monthlySpend: number,
): number | null {
  if (!(monthlySpend > 0) || !(contributed >= 0) || !Number.isFinite(monthlySpend)) {
    return null;
  }
  return Math.round((contributed / monthlySpend) * 10) / 10;
}
