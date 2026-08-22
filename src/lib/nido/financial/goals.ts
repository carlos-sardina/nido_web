import { clampedPercent, goalProgressRatio, moneyOrZero, sumMoney } from "./money.ts";
import type { GoalContributionRow, GoalProgress, GoalRow } from "./types.ts";

export function canMutateGoal(
  goal: Pick<GoalRow, "createdBy" | "status">,
  userId: string | null | undefined,
): boolean {
  return Boolean(userId) && goal.createdBy === userId && goal.status !== "archived";
}

export function isActiveContribution(
  contribution: Pick<GoalContributionRow, "deletedAt">,
): boolean {
  return contribution.deletedAt == null;
}

export function canMutateContribution(
  contribution: Pick<GoalContributionRow, "createdBy" | "deletedAt">,
  userId: string | null | undefined,
  goal?: Pick<GoalRow, "status"> | null,
): boolean {
  return (
    Boolean(userId) &&
    contribution.createdBy === userId &&
    contribution.deletedAt == null &&
    (goal == null || goal.status !== "archived")
  );
}

/**
 * Active contributions of a goal, newest contributed_at first, then newest created_at.
 * Soft-deleted rows are excluded. deleted_at IS NULL is the only active source.
 */
export function visibleGoalContributions(
  contributions: GoalContributionRow[],
): GoalContributionRow[] {
  return contributions
    .filter(isActiveContribution)
    .slice()
    .sort((a, b) => {
      const byDate = b.contributedAt.localeCompare(a.contributedAt);
      if (byDate !== 0) return byDate;
      return b.createdAt.localeCompare(a.createdAt);
    });
}

export function formatGoalTargetDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function contributionsTotal(contributions: GoalContributionRow[]): number {
  return sumMoney(contributions.filter(isActiveContribution).map((row) => row.amount));
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
