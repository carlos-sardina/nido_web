import { nidoErrorFromUnknown, nidoFail, nidoOk, type NidoResult } from "./errors.ts";
import {
  buildCreateExpensePayload,
  type CreateExpenseRequest,
} from "./financial/expense-input.ts";

export type { CreateExpenseRequest };

export type CreateExpenseAuth = {
  getUserId: () => Promise<string | null>;
  rpc: (
    fn: "create_expense",
    args: Record<string, unknown>,
  ) => Promise<{ data: string | null; error: unknown }>;
};

/**
 * Domain mutation used by createExpense().
 * Takes an auth adapter so unit tests do not load the Supabase browser client.
 */
export async function createExpenseWithAuth(
  input: CreateExpenseRequest,
  auth: CreateExpenseAuth,
): Promise<NidoResult<{ id: string }>> {
  const userId = await auth.getUserId();
  if (!userId) return nidoFail("unauthenticated");

  const payload = buildCreateExpensePayload(input, userId);
  if (payload.ok === false) return nidoFail(payload.error);

  const { data, error } = await auth.rpc("create_expense", {
    p_household_id: payload.data.householdId,
    p_category_id: payload.data.categoryId,
    p_amount: payload.data.amount,
    p_description: payload.data.description,
    p_occurred_at: payload.data.occurredAt,
    p_payer_id: payload.data.payerId,
    p_scope: payload.data.scope,
    p_splits: payload.data.splits.map((split) => ({
      member_id: split.memberId,
      amount: split.amount,
      percentage: split.percentage,
    })),
  });

  if (error) return nidoFail(nidoErrorFromUnknown(error).code);
  if (!data) return nidoFail("network");
  return nidoOk({ id: data });
}

export function canSubmitExpense(submitting: boolean): boolean {
  return !submitting;
}
