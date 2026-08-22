import { nidoErrorFromUnknown, nidoFail, nidoOk, type NidoResult } from "./errors.ts";
import type { RecurringIncomeAuth } from "./create-recurring-income.ts";
import {
  buildCreateRecurringIncomePayload,
  type CreateRecurringIncomeRequest,
} from "./financial/recurrence-input.ts";

export type UpdateRecurringIncomeRequest = CreateRecurringIncomeRequest & {
  recurringId: string;
};

export async function updateRecurringIncomeWithAuth(
  input: UpdateRecurringIncomeRequest,
  auth: RecurringIncomeAuth,
): Promise<NidoResult<{ id: string }>> {
  const userId = await auth.getUserId();
  if (!userId) return nidoFail("unauthenticated");
  if (!input.recurringId) return nidoFail("recurrence_not_found");

  const payload = buildCreateRecurringIncomePayload(input, userId);
  if (payload.ok === false) return nidoFail(payload.error);

  const { data, error } = await auth.rpc("update_recurring_income", {
    p_recurring_id: input.recurringId,
    p_category_id: payload.data.categoryId,
    p_amount: payload.data.amount,
    p_description: payload.data.description,
    p_frequency: payload.data.frequency,
    p_end_date: payload.data.endDate,
  });

  if (error) return nidoFail(nidoErrorFromUnknown(error).code);
  if (!data) return nidoFail("network");
  return nidoOk({ id: data });
}
