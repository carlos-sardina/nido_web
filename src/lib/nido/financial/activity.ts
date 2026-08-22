import type { HouseholdMemberView } from "../types";
import { isActiveExpense } from "./expenses.ts";
import { isActiveContribution } from "./goals.ts";
import { isActiveIncome } from "./incomes.ts";
import type {
  ActivityItem,
  ActivitySource,
  ExpenseRow,
  GoalContributionRow,
  GoalRow,
  IncomeRow,
} from "./types";

function memberName(
  memberId: string | null,
  members: HouseholdMemberView[],
  fallback: string | null,
): string | null {
  if (fallback?.trim()) return fallback.trim();
  if (!memberId) return null;
  return members.find((member) => member.userId === memberId)?.displayName ?? null;
}

function firstName(name: string | null): string | null {
  if (!name) return null;
  return name.split(/\s+/).filter(Boolean)[0] ?? name;
}

function belongsToHousehold(
  householdId: string | undefined,
  rowHouseholdId: string,
): boolean {
  return householdId == null || rowHouseholdId === householdId;
}

export function expenseToActivity(
  expense: ExpenseRow,
  members: HouseholdMemberView[],
): ActivityItem {
  const name = memberName(expense.payerId, members, expense.payer?.displayName);
  const categoryName = expense.category?.name?.trim() || null;
  const concept = expense.description?.trim() || categoryName || "un gasto";
  const who = firstName(name);
  const title = who ? `${who} pagó ${concept}` : `Se registró ${concept}`;

  return {
    id: `expense:${expense.id}`,
    type: "expense",
    sourceId: expense.id,
    title,
    amount: expense.amount,
    date: expense.occurredAt,
    createdAt: expense.createdAt,
    memberId: expense.payerId,
    memberName: name,
    icon: expense.category?.icon?.trim() || "💸",
    metadata: {
      scope: expense.scope,
      recurring: expense.recurringId != null,
      categoryName,
    },
  };
}

export function incomeToActivity(
  income: IncomeRow,
  members: HouseholdMemberView[],
): ActivityItem {
  const name = memberName(income.memberId, members, income.member?.displayName);
  const categoryName = income.category?.name?.trim() || null;
  const concept = income.description?.trim() || categoryName || "un ingreso";
  const who = firstName(name);
  const title = who ? `${who} registró ${concept}` : `Se registró ${concept}`;

  return {
    id: `income:${income.id}`,
    type: "income",
    sourceId: income.id,
    title,
    amount: income.amount,
    date: income.occurredAt,
    createdAt: income.createdAt,
    memberId: income.memberId,
    memberName: name,
    icon: income.category?.icon?.trim() || "💰",
    metadata: {
      recurring: income.recurringId != null,
      categoryName,
    },
  };
}

export function contributionToActivity(
  contribution: GoalContributionRow,
  goals: GoalRow[],
  members: HouseholdMemberView[],
): ActivityItem {
  const name = memberName(contribution.memberId, members, contribution.member?.displayName);
  const goal = goals.find((row) => row.id === contribution.goalId);
  const goalName = goal?.name?.trim() || "una meta";
  const who = firstName(name);
  const title = who ? `${who} aportó a ${goalName}` : `Aportación a ${goalName}`;

  return {
    id: `goal_contribution:${contribution.id}`,
    type: "goal_contribution",
    sourceId: contribution.id,
    title,
    amount: contribution.amount,
    date: contribution.contributedAt,
    createdAt: contribution.createdAt,
    memberId: contribution.memberId,
    memberName: name,
    icon: goal?.goalType === "purchase" ? "🎯" : "🛡️",
    metadata: {
      goalId: contribution.goalId,
      goalName,
    },
  };
}

function compareActivity(a: ActivityItem, b: ActivityItem): number {
  const byDate = b.date.localeCompare(a.date);
  if (byDate !== 0) return byDate;
  const createdA = a.createdAt ?? "";
  const createdB = b.createdAt ?? "";
  const byCreated = createdB.localeCompare(createdA);
  if (byCreated !== 0) return byCreated;
  return b.id.localeCompare(a.id);
}

function uniqueById(items: ActivityItem[]): ActivityItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

export function buildActivityItems(input: {
  expenses: ExpenseRow[];
  incomes: IncomeRow[];
  contributions: GoalContributionRow[];
  goals: GoalRow[];
  members: HouseholdMemberView[];
  householdId?: string;
  limit?: number;
}): ActivityItem[] {
  const householdId = input.householdId;
  const goals = input.goals.filter((goal) => belongsToHousehold(householdId, goal.householdId));

  const items: ActivityItem[] = [
    ...input.expenses
      .filter((row) => isActiveExpense(row) && belongsToHousehold(householdId, row.householdId))
      .map((row) => expenseToActivity(row, input.members)),
    ...input.incomes
      .filter((row) => isActiveIncome(row) && belongsToHousehold(householdId, row.householdId))
      .map((row) => incomeToActivity(row, input.members)),
    ...input.contributions
      .filter((row) => {
        if (!isActiveContribution(row)) return false;
        if (!householdId) return true;
        const goal = input.goals.find((item) => item.id === row.goalId);
        return goal == null || goal.householdId === householdId;
      })
      .map((row) => contributionToActivity(row, goals, input.members)),
  ];

  items.sort(compareActivity);
  const unique = uniqueById(items);
  const limit = input.limit ?? 20;
  return unique.slice(0, limit);
}

export function findActivitySource(
  item: ActivityItem,
  input: {
    expenses: ExpenseRow[];
    incomes: IncomeRow[];
    goals: GoalRow[];
  },
): ActivitySource | null {
  if (item.type === "expense") {
    const expense = input.expenses.find((row) => row.id === item.sourceId);
    return expense ? { type: "expense", expense } : null;
  }
  if (item.type === "income") {
    const income = input.incomes.find((row) => row.id === item.sourceId);
    return income ? { type: "income", income } : null;
  }
  const goalId = item.metadata.goalId;
  const goal = goalId ? input.goals.find((row) => row.id === goalId) : null;
  return goal
    ? { type: "goal_contribution", goal, contributionId: item.sourceId }
    : null;
}
