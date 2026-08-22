import { nidoErrorFromUnknown, nidoFail, nidoOk, type NidoResult } from "../errors";
import { nidoClient, requireUser, type NidoClient } from "../session";
import type { HouseholdCategory } from "../financial/categories.ts";
import { mapCategoryRow, type CategoryQueryRow } from "./map.ts";

/**
 * Active expense categories of the caller's household.
 * RLS still filters by membership; householdId only avoids mixing historical Nidos.
 */
export async function fetchActiveExpenseCategories(
  householdId: string,
  supabase: NidoClient = nidoClient(),
): Promise<NidoResult<HouseholdCategory[]>> {
  return fetchActiveCategories(householdId, "expense", supabase);
}

/**
 * Active income categories of the caller's household.
 * RLS still filters by membership; householdId only avoids mixing historical Nidos.
 */
export async function fetchActiveIncomeCategories(
  householdId: string,
  supabase: NidoClient = nidoClient(),
): Promise<NidoResult<HouseholdCategory[]>> {
  return fetchActiveCategories(householdId, "income", supabase);
}

async function fetchActiveCategories(
  householdId: string,
  type: "income" | "expense",
  supabase: NidoClient,
): Promise<NidoResult<HouseholdCategory[]>> {
  const auth = await requireUser(supabase);
  if (auth.ok === false) return nidoFail(auth.error.code);
  if (!householdId) return nidoFail("not_a_member");

  const { data, error } = await auth.data.supabase
    .from("categories")
    .select("id, household_id, name, icon, type, is_default, archived_at")
    .eq("household_id", householdId)
    .eq("type", type)
    .is("archived_at", null)
    .order("name", { ascending: true });

  if (error) {
    return nidoFail(
      nidoErrorFromUnknown(error).code,
      "No pudimos cargar las categorías. Inténtalo de nuevo.",
    );
  }

  return nidoOk(((data ?? []) as CategoryQueryRow[]).map(mapCategoryRow));
}
