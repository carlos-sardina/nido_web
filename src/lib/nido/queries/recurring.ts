import { nidoErrorFromUnknown, nidoFail, nidoOk, type NidoResult } from "../errors";
import type { RecurringExpenseTemplate, RecurringIncomeTemplate } from "../financial/types.ts";
import { nidoClient, requireUser, type NidoClient } from "../session";
import {
  mapRecurringExpenseTemplate,
  mapRecurringIncomeTemplate,
  type RecurringExpenseTemplateQueryRow,
  type RecurringIncomeTemplateQueryRow,
} from "./map.ts";

const INCOME_SELECT =
  "id, household_id, member_id, category_id, amount, description, is_active, frequency, end_date, start_date, next_occurrence, created_by, day_of_month, categories(id, name, icon)";

const EXPENSE_SELECT =
  "id, household_id, category_id, amount, description, scope, is_active, frequency, payer_id, distribution_method, start_date, end_date, next_occurrence, created_by, categories(id, name, icon), payer:profiles!recurring_expenses_payer_id_fkey(id, display_name), recurring_expense_splits(id, member_id, amount, percentage)";

export async function fetchRecurringIncomes(
  householdId: string,
  supabase: NidoClient = nidoClient(),
): Promise<NidoResult<RecurringIncomeTemplate[]>> {
  const auth = await requireUser(supabase);
  if (auth.ok === false) return nidoFail(auth.error.code);
  if (!householdId) return nidoFail("not_a_member");

  const { data, error } = await auth.data.supabase
    .from("recurring_incomes")
    .select(INCOME_SELECT)
    .eq("household_id", householdId)
    .order("next_occurrence", { ascending: true });

  if (error) {
    return nidoFail(
      nidoErrorFromUnknown(error).code,
      "No pudimos cargar las recurrencias. Inténtalo de nuevo.",
    );
  }

  return nidoOk(
    ((data ?? []) as RecurringIncomeTemplateQueryRow[]).map(mapRecurringIncomeTemplate),
  );
}

export async function fetchRecurringExpenses(
  householdId: string,
  supabase: NidoClient = nidoClient(),
): Promise<NidoResult<RecurringExpenseTemplate[]>> {
  const auth = await requireUser(supabase);
  if (auth.ok === false) return nidoFail(auth.error.code);
  if (!householdId) return nidoFail("not_a_member");

  const { data, error } = await auth.data.supabase
    .from("recurring_expenses")
    .select(EXPENSE_SELECT)
    .eq("household_id", householdId)
    .order("next_occurrence", { ascending: true });

  if (error) {
    return nidoFail(
      nidoErrorFromUnknown(error).code,
      "No pudimos cargar las recurrencias. Inténtalo de nuevo.",
    );
  }

  return nidoOk(
    ((data ?? []) as RecurringExpenseTemplateQueryRow[]).map(mapRecurringExpenseTemplate),
  );
}
