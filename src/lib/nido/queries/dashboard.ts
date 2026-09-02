import { copyForwardMonthSalariesWithAuth } from "../copy-month-salaries.ts";
import { ACTIVITY_PAGE_SIZE } from "../financial/activity.ts";
import { OUTSTANDING_BALANCE_LOOKBACK_MONTHS } from "../financial/balance.ts";
import {
  getCurrentMonthRange,
  isSameMonth,
  shiftMonth,
  type MonthRange,
} from "../financial/dates.ts";
import type { DashboardSnapshot, MonthlyBalanceConfirmation } from "../financial/types.ts";
import { nidoErrorFromUnknown, nidoFail, nidoOk, type NidoResult } from "../errors";
import { nidoClient, requireUser, type NidoClient } from "../session";
import {
  type BudgetQueryRow,
  type ContributionQueryRow,
  contributionHouseholdId,
  type ExpenseQueryRow,
  type GoalQueryRow,
  type IncomeQueryRow,
  mapBudgetRow,
  mapContributionRow,
  mapExpenseRow,
  mapGoalRow,
  mapIncomeRow,
  mapRecurringExpenseRow,
  mapRecurringIncomeRow,
  type RecurringExpenseQueryRow,
  type RecurringIncomeQueryRow,
} from "./map.ts";

const DEFAULT_RECENT_LIMIT = ACTIVITY_PAGE_SIZE;

const EXPENSE_SELECT =
  "id, household_id, category_id, amount, description, occurred_at, payer_id, scope, distribution_method, recurring_id, created_by, created_at, deleted_at, categories(id, name, icon), expense_splits(id, expense_id, member_id, amount, percentage), expense_refunds(id, expense_id, amount, occurred_at, created_by, created_at, expense_refund_splits(id, refund_id, member_id, amount, percentage)), payer:profiles!expenses_payer_id_fkey(id, display_name)";

const INCOME_SELECT =
  "id, household_id, member_id, category_id, amount, description, occurred_at, recurring_id, created_by, created_at, deleted_at, categories(id, name, icon), member:profiles!incomes_member_id_fkey(id, display_name)";

const GOAL_SELECT =
  "id, household_id, name, description, goal_type, scope, target_amount, target_date, status, created_by, created_at, goal_contributions(id, goal_id, member_id, amount, contributed_at, created_by, created_at, deleted_at)";

const CONTRIBUTION_SELECT =
  "id, goal_id, member_id, amount, contributed_at, created_by, created_at, deleted_at, member:profiles!goal_contributions_member_id_fkey(id, display_name), goals(id, name, household_id)";

type ConfirmationQueryRow = {
  household_id: string;
  year: number;
  month: number;
  user_id: string;
  confirmed_at: string;
};

function mapConfirmationRow(row: ConfirmationQueryRow): MonthlyBalanceConfirmation {
  return {
    householdId: row.household_id,
    year: Number(row.year),
    month: Number(row.month),
    userId: row.user_id,
    confirmedAt: row.confirmed_at,
  };
}

/**
 * Reads the active Nido's financial facts for the dashboard.
 *
 * `householdId` must be the active membership household from useMyNido /
 * getMyNidoState. RLS still filters rows; this argument only scopes the
 * query to the current Nido so historical memberships are not mixed in.
 */
export async function fetchDashboardSnapshot(
  householdId: string,
  range: MonthRange = getCurrentMonthRange(),
  supabase: NidoClient = nidoClient(),
  recentLimit: number = DEFAULT_RECENT_LIMIT,
  options?: { includeSharedHistory?: boolean },
): Promise<NidoResult<DashboardSnapshot>> {
  const auth = await requireUser(supabase);
  if (auth.ok === false) return nidoFail(auth.error.code);
  if (!householdId) return nidoFail("not_a_member");

  const client = auth.data.supabase;
  if (isSameMonth(range, getCurrentMonthRange())) {
    await copyForwardMonthSalariesWithAuth({
      getUserId: async () => auth.data.user.id,
      rpc: async (fn) => {
        const result = await client.rpc(fn);
        return { data: result.data, error: result.error };
      },
    });
  }

  const historyLimit = Math.max(recentLimit, DEFAULT_RECENT_LIMIT);
  const includeSharedHistory = options?.includeSharedHistory === true;
  const historyFrom = includeSharedHistory
    ? shiftMonth(range, -(OUTSTANDING_BALANCE_LOOKBACK_MONTHS - 1)).start
    : null;

  const [
    periodExpensesRes,
    recentExpensesRes,
    periodIncomesRes,
    recentIncomesRes,
    recurringIncomesRes,
    recurringExpensesRes,
    budgetsRes,
    goalsRes,
    contributionsRes,
    confirmationsRes,
    sharedHistoryRes,
  ] = await Promise.all([
    client
      .from("expenses")
      .select(EXPENSE_SELECT)
      .eq("household_id", householdId)
      .is("deleted_at", null)
      .gte("occurred_at", range.start)
      .lte("occurred_at", range.end)
      .order("occurred_at", { ascending: false })
      .order("created_at", { ascending: false }),
    client
      .from("expenses")
      .select(EXPENSE_SELECT)
      .eq("household_id", householdId)
      .is("deleted_at", null)
      .order("occurred_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(historyLimit),
    client
      .from("incomes")
      .select(INCOME_SELECT)
      .eq("household_id", householdId)
      .is("deleted_at", null)
      .gte("occurred_at", range.start)
      .lte("occurred_at", range.end)
      .order("occurred_at", { ascending: false })
      .order("created_at", { ascending: false }),
    client
      .from("incomes")
      .select(INCOME_SELECT)
      .eq("household_id", householdId)
      .is("deleted_at", null)
      .order("occurred_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(historyLimit),
    client
      .from("recurring_incomes")
      .select("id, household_id, member_id, amount, description, is_active, frequency, end_date")
      .eq("household_id", householdId)
      .eq("is_active", true),
    client
      .from("recurring_expenses")
      .select("id, household_id, amount, description, scope, is_active, frequency")
      .eq("household_id", householdId)
      .eq("is_active", true),
    client
      .from("budgets")
      .select("id, household_id, member_id, category_id, amount, period, start_date, end_date, created_by, created_at, deleted_at, categories(id, name, icon)")
      .eq("household_id", householdId)
      .is("deleted_at", null)
      .lte("start_date", range.end)
      .gte("end_date", range.start),
    client
      .from("goals")
      .select(GOAL_SELECT)
      .eq("household_id", householdId)
      .neq("status", "archived")
      .order("created_at", { ascending: true }),
    client
      .from("goal_contributions")
      .select(CONTRIBUTION_SELECT)
      .is("deleted_at", null)
      .order("contributed_at", { ascending: false })
      .limit(historyLimit),
    client
      .from("monthly_balance_confirmations")
      .select("household_id, year, month, user_id, confirmed_at")
      .eq("household_id", householdId),
    includeSharedHistory && historyFrom
      ? client
          .from("expenses")
          .select(EXPENSE_SELECT)
          .eq("household_id", householdId)
          .eq("scope", "shared")
          .is("deleted_at", null)
          .gte("occurred_at", historyFrom)
          .lte("occurred_at", range.end)
          .order("occurred_at", { ascending: false })
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as ExpenseQueryRow[], error: null }),
  ]);

  const firstError =
    periodExpensesRes.error ??
    recentExpensesRes.error ??
    periodIncomesRes.error ??
    recentIncomesRes.error ??
    recurringIncomesRes.error ??
    recurringExpensesRes.error ??
    budgetsRes.error ??
    goalsRes.error ??
    contributionsRes.error ??
    confirmationsRes.error ??
    sharedHistoryRes.error;

  if (firstError) {
    return nidoFail(
      nidoErrorFromUnknown(firstError).code,
      "No pudimos cargar tus datos. Inténtalo de nuevo.",
    );
  }

  const periodExpenses = ((periodExpensesRes.data ?? []) as ExpenseQueryRow[]).map(mapExpenseRow);
  const expenses = ((recentExpensesRes.data ?? []) as ExpenseQueryRow[]).map(mapExpenseRow);
  const periodIncomes = ((periodIncomesRes.data ?? []) as IncomeQueryRow[]).map(mapIncomeRow);
  const incomes = ((recentIncomesRes.data ?? []) as IncomeQueryRow[]).map(mapIncomeRow);
  const goals = ((goalsRes.data ?? []) as GoalQueryRow[]).map(mapGoalRow);

  const contributions = ((contributionsRes.data ?? []) as ContributionQueryRow[])
    .filter((row) => contributionHouseholdId(row) === householdId)
    .map(mapContributionRow);

  return nidoOk({
    householdId,
    range,
    expenses,
    periodExpenses,
    incomes,
    periodIncomes,
    recurringIncomes: ((recurringIncomesRes.data ?? []) as RecurringIncomeQueryRow[]).map(
      mapRecurringIncomeRow,
    ),
    recurringExpenses: ((recurringExpensesRes.data ?? []) as RecurringExpenseQueryRow[]).map(
      mapRecurringExpenseRow,
    ),
    budgets: ((budgetsRes.data ?? []) as BudgetQueryRow[]).map(mapBudgetRow),
    goals,
    contributions,
    balanceConfirmations: ((confirmationsRes.data ?? []) as ConfirmationQueryRow[]).map(
      mapConfirmationRow,
    ),
    sharedHistoryExpenses: ((sharedHistoryRes.data ?? []) as ExpenseQueryRow[]).map(mapExpenseRow),
  });
}
