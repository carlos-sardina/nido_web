import { nidoErrorFromUnknown, nidoFail, nidoOk, type NidoResult } from "./errors.ts";
import {
  buildCreateExpensePayload,
  type CreateExpenseRequest,
} from "./financial/expense-input.ts";

export type UpdateExpenseRequest = CreateExpenseRequest & {
  expenseId: string;
};

export type UpdateExpenseAuth = {
  getUserId: () => Promise<string | null>;
  rpc: (
    fn: "update_expense",
    args: Record<string, unknown>,
  ) => Promise<{ data: string | null; error: unknown }>;
};

export async function updateExpenseWithAuth(
  input: UpdateExpenseRequest,
  auth: UpdateExpenseAuth,
): Promise<NidoResult<{ id: string }>> {
  const userId = await auth.getUserId();
  if (!userId) return nidoFail("unauthenticated");
  if (!input.expenseId) return nidoFail("expense_not_found");

  const payload = buildCreateExpensePayload(input, userId);
  if (payload.ok === false) return nidoFail(payload.error);

  const { data, error } = await auth.rpc("update_expense", {
    p_expense_id: input.expenseId,
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
