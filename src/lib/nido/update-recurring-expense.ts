import { nidoErrorFromUnknown, nidoFail, nidoOk, type NidoResult } from "./errors.ts";
import type { RecurringExpenseAuth } from "./create-recurring-expense.ts";
import {
  buildCreateRecurringExpensePayload,
  type CreateRecurringExpenseRequest,
} from "./financial/recurrence-input.ts";

export type UpdateRecurringExpenseRequest = CreateRecurringExpenseRequest & {
  recurringId: string;
};

export async function updateRecurringExpenseWithAuth(
  input: UpdateRecurringExpenseRequest,
  auth: RecurringExpenseAuth,
): Promise<NidoResult<{ id: string }>> {
  const userId = await auth.getUserId();
  if (!userId) return nidoFail("unauthenticated");
  if (!input.recurringId) return nidoFail("recurrence_not_found");

  const payload = buildCreateRecurringExpensePayload(input, userId);
  if (payload.ok === false) return nidoFail(payload.error);

  const { data, error } = await auth.rpc("update_recurring_expense", {
    p_recurring_id: input.recurringId,
    p_category_id: payload.data.categoryId,
    p_amount: payload.data.amount,
    p_description: payload.data.description,
    p_frequency: payload.data.frequency,
    p_end_date: payload.data.endDate,
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
