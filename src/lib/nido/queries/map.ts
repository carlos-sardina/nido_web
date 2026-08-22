import type { HouseholdCategory } from "../financial/categories.ts";
import { moneyOrZero, parseMoney } from "../financial/money.ts";
import type {
  BudgetRow,
  CategoryRef,
  ExpenseRow,
  ExpenseSplitRow,
  GoalContributionRow,
  GoalRow,
  IncomeRow,
  MemberRef,
  RecurringExpenseRow,
  RecurringExpenseTemplate,
  RecurringIncomeRow,
  RecurringIncomeTemplate,
  RecurringSplitRow,
} from "../financial/types.ts";
import { unwrapMany, unwrapOne } from "./embed.ts";

type CategoryEmbed = { id: string; name: string; icon: string | null } | null;
type ProfileEmbed = { id: string; display_name: string } | null;

function categoryRef(value: CategoryEmbed | CategoryEmbed[] | null | undefined): CategoryRef | null {
  const row = unwrapOne(value);
  if (!row) return null;
  return { id: row.id, name: row.name, icon: row.icon };
}

function memberRef(value: ProfileEmbed | ProfileEmbed[] | null | undefined): MemberRef | null {
  const row = unwrapOne(value);
  if (!row) return null;
  return { id: row.id, displayName: row.display_name };
}

export type ExpenseQueryRow = {
  id: string;
  household_id: string;
  category_id: string;
  amount: unknown;
  description: string | null;
  occurred_at: string;
  payer_id: string;
  scope: ExpenseRow["scope"];
  distribution_method: ExpenseRow["distributionMethod"];
  recurring_id: string | null;
  created_by: string;
  created_at: string;
  deleted_at: string | null;
  categories?: CategoryEmbed | CategoryEmbed[];
  expense_splits?: Array<{
    id: string;
    expense_id?: string;
    member_id: string;
    amount: unknown;
    percentage: unknown;
  }> | null;
  payer?: ProfileEmbed | ProfileEmbed[];
};

export function mapExpenseRow(row: ExpenseQueryRow): ExpenseRow {
  const splits: ExpenseSplitRow[] = (row.expense_splits ?? []).map((split) => ({
    id: split.id,
    expenseId: split.expense_id ?? row.id,
    memberId: split.member_id,
    amount: moneyOrZero(split.amount),
    percentage: parseMoney(split.percentage),
  }));

  return {
    id: row.id,
    householdId: row.household_id,
    categoryId: row.category_id,
    amount: moneyOrZero(row.amount),
    description: row.description,
    occurredAt: row.occurred_at,
    payerId: row.payer_id,
    scope: row.scope,
    distributionMethod: row.distribution_method,
    recurringId: row.recurring_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
    category: categoryRef(row.categories),
    payer: memberRef(row.payer),
    splits,
  };
}

export type IncomeQueryRow = {
  id: string;
  household_id: string;
  member_id: string;
  category_id: string;
  amount: unknown;
  description: string | null;
  occurred_at: string;
  recurring_id: string | null;
  created_by: string;
  created_at: string;
  deleted_at: string | null;
  categories?: CategoryEmbed | CategoryEmbed[];
  member?: ProfileEmbed | ProfileEmbed[];
};

export function mapIncomeRow(row: IncomeQueryRow): IncomeRow {
  return {
    id: row.id,
    householdId: row.household_id,
    memberId: row.member_id,
    categoryId: row.category_id,
    amount: moneyOrZero(row.amount),
    description: row.description,
    occurredAt: row.occurred_at,
    recurringId: row.recurring_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
    category: categoryRef(row.categories),
    member: memberRef(row.member),
  };
}

export type RecurringIncomeQueryRow = {
  id: string;
  household_id: string;
  member_id: string;
  amount: unknown;
  description: string | null;
  is_active: boolean;
  frequency: RecurringIncomeRow["frequency"];
  end_date: string | null;
};

export function mapRecurringIncomeRow(row: RecurringIncomeQueryRow): RecurringIncomeRow {
  return {
    id: row.id,
    householdId: row.household_id,
    memberId: row.member_id,
    amount: moneyOrZero(row.amount),
    description: row.description,
    isActive: row.is_active,
    frequency: row.frequency,
    endDate: row.end_date,
  };
}

export type RecurringExpenseQueryRow = {
  id: string;
  household_id: string;
  amount: unknown;
  description: string | null;
  scope: RecurringExpenseRow["scope"];
  is_active: boolean;
  frequency: RecurringExpenseRow["frequency"];
};

export function mapRecurringExpenseRow(row: RecurringExpenseQueryRow): RecurringExpenseRow {
  return {
    id: row.id,
    householdId: row.household_id,
    amount: moneyOrZero(row.amount),
    description: row.description,
    scope: row.scope,
    isActive: row.is_active,
    frequency: row.frequency,
  };
}

export type RecurringIncomeTemplateQueryRow = RecurringIncomeQueryRow & {
  category_id: string;
  start_date: string;
  next_occurrence: string;
  created_by: string;
  day_of_month: number | null;
  categories?: CategoryEmbed | CategoryEmbed[];
};

export function mapRecurringIncomeTemplate(
  row: RecurringIncomeTemplateQueryRow,
): RecurringIncomeTemplate {
  return {
    ...mapRecurringIncomeRow(row),
    categoryId: row.category_id,
    startDate: row.start_date,
    nextOccurrence: row.next_occurrence,
    createdBy: row.created_by,
    dayOfMonth: row.day_of_month,
    category: categoryRef(row.categories),
  };
}

export type RecurringExpenseTemplateQueryRow = RecurringExpenseQueryRow & {
  category_id: string;
  payer_id: string;
  distribution_method: RecurringExpenseTemplate["distributionMethod"];
  start_date: string;
  end_date: string | null;
  next_occurrence: string;
  created_by: string;
  categories?: CategoryEmbed | CategoryEmbed[];
  payer?: ProfileEmbed | ProfileEmbed[];
  recurring_expense_splits?: Array<{
    id: string;
    member_id: string;
    amount: unknown;
    percentage: unknown;
  }> | null;
};

export function mapRecurringExpenseTemplate(
  row: RecurringExpenseTemplateQueryRow,
): RecurringExpenseTemplate {
  const splits: RecurringSplitRow[] = (row.recurring_expense_splits ?? []).map((split) => ({
    id: split.id,
    memberId: split.member_id,
    amount: moneyOrZero(split.amount),
    percentage: parseMoney(split.percentage),
  }));

  return {
    ...mapRecurringExpenseRow(row),
    categoryId: row.category_id,
    payerId: row.payer_id,
    distributionMethod: row.distribution_method,
    startDate: row.start_date,
    endDate: row.end_date,
    nextOccurrence: row.next_occurrence,
    createdBy: row.created_by,
    category: categoryRef(row.categories),
    payer: memberRef(row.payer),
    splits,
  };
}

export type BudgetQueryRow = {
  id: string;
  household_id: string;
  member_id: string | null;
  category_id: string;
  amount: unknown;
  period: "monthly";
  start_date: string;
  end_date: string;
  created_by: string;
  created_at: string;
  deleted_at: string | null;
  categories?: CategoryEmbed | CategoryEmbed[];
};

export function mapBudgetRow(row: BudgetQueryRow): BudgetRow {
  return {
    id: row.id,
    householdId: row.household_id,
    memberId: row.member_id,
    categoryId: row.category_id,
    amount: moneyOrZero(row.amount),
    period: row.period,
    startDate: row.start_date,
    endDate: row.end_date,
    createdBy: row.created_by,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
    category: categoryRef(row.categories),
  };
}

export type GoalQueryRow = {
  id: string;
  household_id: string;
  name: string;
  description: string | null;
  goal_type: GoalRow["goalType"];
  target_amount: unknown;
  target_date: string | null;
  status: GoalRow["status"];
  created_by: string;
  created_at: string;
  goal_contributions?: ContributionQueryRow[] | ContributionQueryRow | null;
};

export type ContributionQueryRow = {
  id: string;
  goal_id: string;
  member_id: string;
  amount: unknown;
  contributed_at: string;
  created_by: string;
  created_at: string;
  deleted_at?: string | null;
  member?: ProfileEmbed | ProfileEmbed[];
  goals?: { id: string; name: string; household_id: string } | { id: string; name: string; household_id: string }[] | null;
};

export function mapContributionRow(row: ContributionQueryRow): GoalContributionRow {
  return {
    id: row.id,
    goalId: row.goal_id,
    memberId: row.member_id,
    amount: moneyOrZero(row.amount),
    contributedAt: row.contributed_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    deletedAt: row.deleted_at ?? null,
    member: memberRef(row.member),
  };
}

export function mapGoalRow(row: GoalQueryRow): GoalRow {
  return {
    id: row.id,
    householdId: row.household_id,
    name: row.name,
    description: row.description,
    goalType: row.goal_type,
    targetAmount: moneyOrZero(row.target_amount),
    targetDate: row.target_date,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    contributions: unwrapMany(row.goal_contributions).map(mapContributionRow),
  };
}

export function contributionHouseholdId(row: ContributionQueryRow): string | null {
  return unwrapOne(row.goals)?.household_id ?? null;
}

export type CategoryQueryRow = {
  id: string;
  household_id: string;
  name: string;
  icon: string | null;
  type: "income" | "expense";
  is_default: boolean | null;
  archived_at: string | null;
};

export function mapCategoryRow(row: CategoryQueryRow): HouseholdCategory {
  return {
    id: row.id,
    householdId: row.household_id,
    name: row.name,
    icon: row.icon,
    type: row.type,
    isDefault: Boolean(row.is_default),
    archivedAt: row.archived_at,
  };
}
