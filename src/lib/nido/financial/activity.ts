import type { HouseholdMemberView } from "../types";
import type {
  ActivityItem,
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
    title,
    amount: contribution.amount,
    date: contribution.contributedAt,
    createdAt: contribution.createdAt,
    memberId: contribution.memberId,
    memberName: name,
    icon: goal?.goalType === "purchase" ? "🎯" : "🛡️",
    metadata: {
      goalName,
    },
  };
}

function sortKey(item: ActivityItem): string {
  return `${item.date}T${item.createdAt ?? ""}`;
}

export function buildActivityItems(input: {
  expenses: ExpenseRow[];
  incomes: IncomeRow[];
  contributions: GoalContributionRow[];
  goals: GoalRow[];
  members: HouseholdMemberView[];
  limit?: number;
}): ActivityItem[] {
  const items: ActivityItem[] = [
    ...input.expenses.map((row) => expenseToActivity(row, input.members)),
    ...input.incomes.map((row) => incomeToActivity(row, input.members)),
    ...input.contributions.map((row) =>
      contributionToActivity(row, input.goals, input.members),
    ),
  ];

  items.sort((a, b) => {
    const byKey = sortKey(b).localeCompare(sortKey(a));
    if (byKey !== 0) return byKey;
    return b.id.localeCompare(a.id);
  });

  const limit = input.limit ?? 20;
  return items.slice(0, limit);
}
