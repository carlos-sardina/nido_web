import { nidoErrorFromUnknown, nidoFail, nidoOk, type NidoResult } from "./errors.ts";
import {
  buildCreateBudgetPayload,
  type CreateBudgetRequest,
} from "./financial/budget-input.ts";

export type { CreateBudgetRequest };

export type CreateBudgetAuth = {
  getUserId: () => Promise<string | null>;
  rpc: (
    fn: "create_budget",
    args: Record<string, unknown>,
  ) => Promise<{ data: string | null; error: unknown }>;
};

/**
 * Domain mutation used by createBudget().
 * Takes an auth adapter so unit tests do not load the Supabase browser client.
 *
 * created_by and member_id are never taken from the client. The RPC derives
 * created_by from auth.uid() and always writes member_id NULL.
 */
export async function createBudgetWithAuth(
  input: CreateBudgetRequest,
  auth: CreateBudgetAuth,
): Promise<NidoResult<{ id: string }>> {
  const userId = await auth.getUserId();
  if (!userId) return nidoFail("unauthenticated");

  const payload = buildCreateBudgetPayload(input, userId);
  if (payload.ok === false) return nidoFail(payload.error);

  const { data, error } = await auth.rpc("create_budget", {
    p_household_id: payload.data.householdId,
    p_category_id: payload.data.categoryId,
    p_amount: payload.data.amount,
    p_start_date: payload.data.startDate,
    p_end_date: payload.data.endDate,
  });

  if (error) return nidoFail(nidoErrorFromUnknown(error).code);
  if (!data) return nidoFail("network");
  return nidoOk({ id: data });
}

export function canSubmitBudget(submitting: boolean): boolean {
  return !submitting;
}
