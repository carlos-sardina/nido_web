import { nidoErrorFromUnknown, nidoFail, nidoOk, type NidoResult } from "./errors.ts";
import {
  buildCreateIncomePayload,
  type CreateIncomeRequest,
} from "./financial/income-input.ts";

export type { CreateIncomeRequest };

export type CreateIncomeAuth = {
  getUserId: () => Promise<string | null>;
  rpc: (
    fn: "create_income",
    args: Record<string, unknown>,
  ) => Promise<{ data: string | null; error: unknown }>;
};

/**
 * Domain mutation used by createIncome().
 * Takes an auth adapter so unit tests do not load the Supabase browser client.
 *
 * member_id and created_by are never taken from the client. The RPC derives
 * both from auth.uid().
 */
export async function createIncomeWithAuth(
  input: CreateIncomeRequest,
  auth: CreateIncomeAuth,
): Promise<NidoResult<{ id: string }>> {
  const userId = await auth.getUserId();
  if (!userId) return nidoFail("unauthenticated");

  const payload = buildCreateIncomePayload(input, userId);
  if (payload.ok === false) return nidoFail(payload.error);

  const { data, error } = await auth.rpc("create_income", {
    p_household_id: payload.data.householdId,
    p_category_id: payload.data.categoryId,
    p_amount: payload.data.amount,
    p_description: payload.data.description,
    p_occurred_at: payload.data.occurredAt,
  });

  if (error) return nidoFail(nidoErrorFromUnknown(error).code);
  if (!data) return nidoFail("network");
  return nidoOk({ id: data });
}

export function canSubmitIncome(submitting: boolean): boolean {
  return !submitting;
}
