import type { HouseholdMemberView } from "../types";
import { todayIso } from "./dates.ts";
import { isActiveExpense, isPaidByAllMembers } from "./expenses.ts";
import { isActiveContribution } from "./goals.ts";
import { isActiveIncome } from "./incomes.ts";
import type {
  ActivityItem,
  ActivityMutationAction,
  ActivityMutationEntity,
  ActivitySource,
  ExpenseRefundRow,
  ExpenseRow,
  ExpenseScope,
  GoalContributionRow,
  GoalRow,
  HouseholdMutationEvent,
  IncomeRow,
} from "./types";

export type ActivityScopeFilter = "all" | "shared" | "personal";

export const ACTIVITY_PAGE_SIZE = 30;

/**
 * Incomes carry no scope: each one belongs to a single member and there is no
 * shared income. Treating them as personal keeps them out of "compartido".
 */
export function activityItemScope(item: ActivityItem): ExpenseScope {
  return item.metadata.scope ?? "personal";
}

export function isOwnPersonalActivity(
  item: ActivityItem,
  viewerId: string | null | undefined,
): boolean {
  if (!viewerId) return false;
  if (activityItemScope(item) !== "personal") return false;
  return item.memberId === viewerId;
}

export function filterActivityByScope(
  items: ActivityItem[],
  filter: ActivityScopeFilter,
  viewerId?: string | null,
): ActivityItem[] {
  if (filter === "all") return items;
  if (filter === "shared") {
    return items.filter((item) => activityItemScope(item) === "shared");
  }
  return items.filter((item) => isOwnPersonalActivity(item, viewerId));
}

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

/** Confirmed expense only. Leftover `recurring_expenses` templates are not activity. */
export function expenseToActivity(
  expense: ExpenseRow,
  members: HouseholdMemberView[],
): ActivityItem {
  const paidByAll = isPaidByAllMembers(expense);
  const name = paidByAll
    ? "Todos"
    : memberName(expense.payerId, members, expense.payer?.displayName);
  const categoryName = expense.category?.name?.trim() || null;
  const concept = expense.description?.trim() || categoryName || "un gasto";
  const who = firstName(name);
  const title = paidByAll
    ? `Todos pagaron ${concept}`
    : who
      ? `${who} pagó ${concept}`
      : `Se registró ${concept}`;

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

export function refundToActivity(
  refund: ExpenseRefundRow,
  expense: ExpenseRow,
  members: HouseholdMemberView[],
): ActivityItem {
  const name = memberName(refund.createdBy, members, null);
  const categoryName = expense.category?.name?.trim() || null;
  const concept = expense.description?.trim() || categoryName || "un gasto";
  const who = firstName(name);
  const title = who
    ? `${who} registró una devolución de ${concept}`
    : `Devolución de ${concept}`;

  return {
    id: `refund:${refund.id}`,
    type: "refund",
    sourceId: refund.id,
    title,
    amount: refund.amount,
    date: refund.occurredAt,
    createdAt: refund.createdAt,
    memberId: refund.createdBy,
    memberName: name,
    icon: expense.category?.icon?.trim() || "↩️",
    metadata: {
      scope: expense.scope,
      categoryName,
      expenseId: expense.id,
    },
  };
}

function calendarDateFromTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return todayIso();
  return todayIso(date);
}

function mutationFallback(entityType: ActivityMutationEntity): string {
  switch (entityType) {
    case "expense":
      return "un gasto";
    case "budget":
      return "un presupuesto";
    case "goal":
      return "una meta";
    case "goal_contribution":
      return "una meta";
    case "category":
      return "una categoría";
    case "household":
      return "el Nido";
    case "savings":
      return "el ahorro compartido";
  }
}

function mutationIcon(
  event: HouseholdMutationEvent,
): string {
  if (event.icon?.trim()) return event.icon.trim();
  switch (event.entityType) {
    case "expense":
      return "💸";
    case "budget":
      return "📊";
    case "goal":
    case "goal_contribution":
      return "🎯";
    case "category":
      return "🏷️";
    case "household":
      return "🏠";
    case "savings":
      return "🏦";
  }
}

function mutationTitle(
  event: HouseholdMutationEvent,
  who: string | null,
): string {
  const concept = event.label.trim() || mutationFallback(event.entityType);
  switch (event.entityType) {
    case "expense":
      if (event.action === "deleted") {
        return who ? `${who} eliminó ${concept}` : `Se eliminó ${concept}`;
      }
      return who ? `${who} editó ${concept}` : `Se editó ${concept}`;
    case "budget":
      if (event.action === "deleted") {
        return who
          ? `${who} eliminó el presupuesto de ${concept}`
          : `Se eliminó el presupuesto de ${concept}`;
      }
      return who
        ? `${who} ajustó el presupuesto de ${concept}`
        : `Se ajustó el presupuesto de ${concept}`;
    case "goal":
      if (event.action === "archived") {
        return who ? `${who} archivó ${concept}` : `Se archivó ${concept}`;
      }
      return who ? `${who} editó ${concept}` : `Se editó ${concept}`;
    case "goal_contribution":
      if (event.action === "deleted") {
        return who
          ? `${who} eliminó su aportación a ${concept}`
          : `Se eliminó una aportación a ${concept}`;
      }
      return who
        ? `${who} editó su aportación a ${concept}`
        : `Se editó una aportación a ${concept}`;
    case "category":
      if (event.action === "archived") {
        return who
          ? `${who} archivó la categoría ${concept}`
          : `Se archivó la categoría ${concept}`;
      }
      return who
        ? `${who} ajustó la categoría ${concept}`
        : `Se ajustó la categoría ${concept}`;
    case "household":
      if (event.detail === "split_method") {
        return who ? `${who} cambió el método de división` : "Se cambió el método de división";
      }
      return who ? `${who} cambió el nombre del Nido` : "Se cambió el nombre del Nido";
    case "savings":
      return who ? `${who} ajustó el ahorro compartido` : "Se ajustó el ahorro compartido";
  }
}

export function mutationToActivity(
  event: HouseholdMutationEvent,
  members: HouseholdMemberView[],
): ActivityItem {
  const name = memberName(event.actorId, members, null);
  const who = firstName(name);
  const date = calendarDateFromTimestamp(event.occurredAt);

  return {
    id: `mutation:${event.id}`,
    type: "mutation",
    sourceId: event.entityId,
    title: mutationTitle(event, who),
    amount: event.amount ?? 0,
    date,
    createdAt: event.occurredAt,
    memberId: event.actorId,
    memberName: name,
    icon: mutationIcon(event),
    metadata: {
      scope: event.scope,
      action: event.action,
      entityType: event.entityType,
      detail: event.detail,
      categoryName: event.entityType === "category" || event.entityType === "budget" || event.entityType === "expense"
        ? event.label
        : null,
      goalId:
        event.entityType === "goal"
          ? event.entityId
          : event.entityType === "goal_contribution"
            ? event.detail
            : null,
      goalName: event.entityType === "goal" || event.entityType === "goal_contribution"
        ? event.label
        : null,
      expenseId: event.entityType === "expense" ? event.entityId : null,
      budgetId: event.entityType === "budget" ? event.entityId : null,
    },
  };
}

export function activityShowsAmount(item: ActivityItem): boolean {
  if (item.type !== "mutation") return true;
  const entity = item.metadata.entityType;
  return (
    entity === "expense" ||
    entity === "budget" ||
    entity === "goal" ||
    entity === "goal_contribution" ||
    entity === "savings"
  );
}

export function mutationActionLabel(action: ActivityMutationAction | undefined): string | null {
  if (action === "edited") return "Editado";
  if (action === "deleted") return "Eliminado";
  if (action === "archived") return "Archivado";
  if (action === "adjusted") return "Ajuste";
  return null;
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
      scope: goal?.scope,
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
  mutationEvents?: HouseholdMutationEvent[];
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
    ...input.expenses
      .filter((row) => isActiveExpense(row) && belongsToHousehold(householdId, row.householdId))
      .flatMap((row) =>
        (row.refunds ?? []).map((refund) => refundToActivity(refund, row, input.members)),
      ),
    ...(input.mutationEvents ?? [])
      .filter((event) => belongsToHousehold(householdId, event.householdId))
      .map((event) => mutationToActivity(event, input.members)),
  ];

  items.sort(compareActivity);
  const unique = uniqueById(items);
  if (input.limit == null) return unique;
  return unique.slice(0, input.limit);
}

export function findActivitySource(
  item: ActivityItem,
  input: {
    expenses: ExpenseRow[];
    incomes: IncomeRow[];
    goals: GoalRow[];
    budgetIds?: Iterable<string>;
  },
): ActivitySource | null {
  if (item.type === "mutation") {
    if (item.metadata.action === "deleted" || item.metadata.action === "archived") {
      return null;
    }
    if (item.metadata.entityType === "expense") {
      const expense = input.expenses.find((row) => row.id === item.sourceId);
      return expense ? { type: "expense", expense } : null;
    }
    if (item.metadata.entityType === "goal" || item.metadata.entityType === "goal_contribution") {
      const goalId = item.metadata.entityType === "goal" ? item.sourceId : item.metadata.goalId;
      const goal = goalId ? input.goals.find((row) => row.id === goalId) : null;
      return goal
        ? { type: "goal_contribution", goal, contributionId: item.sourceId }
        : null;
    }
    if (item.metadata.entityType === "budget") {
      const budgetIds = new Set(input.budgetIds ?? []);
      return budgetIds.has(item.sourceId) ? { type: "budget", budgetId: item.sourceId } : null;
    }
    if (item.metadata.entityType === "household" || item.metadata.entityType === "category") {
      return { type: "household" };
    }
    return null;
  }
  if (item.type === "expense" || item.type === "refund") {
    const expenseId = item.type === "refund" ? item.metadata.expenseId : item.sourceId;
    const expense = input.expenses.find((row) => row.id === expenseId);
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
