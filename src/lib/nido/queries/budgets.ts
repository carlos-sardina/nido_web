import type { MonthRange } from "../financial/dates.ts";
import type { BudgetRow } from "../financial/types.ts";
import { nidoErrorFromUnknown, nidoFail, nidoOk, type NidoResult } from "../errors";
import { nidoClient, requireUser, type NidoClient } from "../session";
import { mapBudgetRow, type BudgetQueryRow } from "./map.ts";

const BUDGET_SELECT =
  "id, household_id, member_id, category_id, amount, period, start_date, end_date, created_by, created_at, deleted_at, categories(id, name, icon)";

/**
 * Live budgets that overlap a calendar month.
 * RLS still filters by membership; householdId only avoids mixing historical Nidos.
 */
export async function fetchBudgetsForRange(
  householdId: string,
  range: MonthRange,
  supabase: NidoClient = nidoClient(),
): Promise<NidoResult<BudgetRow[]>> {
  const auth = await requireUser(supabase);
  if (auth.ok === false) return nidoFail(auth.error.code);
  if (!householdId) return nidoFail("not_a_member");

  const { data, error } = await auth.data.supabase
    .from("budgets")
    .select(BUDGET_SELECT)
    .eq("household_id", householdId)
    .is("deleted_at", null)
    .lte("start_date", range.end)
    .gte("end_date", range.start);

  if (error) {
    return nidoFail(
      nidoErrorFromUnknown(error).code,
      "No pudimos cargar los presupuestos. Inténtalo de nuevo.",
    );
  }

  return nidoOk(((data ?? []) as BudgetQueryRow[]).map(mapBudgetRow));
}
