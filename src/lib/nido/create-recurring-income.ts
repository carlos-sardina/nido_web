import { nidoErrorFromUnknown, nidoFail, nidoOk, type NidoResult } from "./errors.ts";
import {
  buildCreateRecurringIncomePayload,
  type CreateRecurringIncomeRequest,
} from "./financial/recurrence-input.ts";

export type { CreateRecurringIncomeRequest };

export type RecurringIncomeAuth = {
  getUserId: () => Promise<string | null>;
  rpc: (
    fn:
      | "create_recurring_income"
      | "update_recurring_income"
      | "set_recurring_income_active"
      | "materialize_recurring_income",
    args: Record<string, unknown>,
  ) => Promise<{ data: string | null; error: unknown }>;
};

export async function createRecurringIncomeWithAuth(
  input: CreateRecurringIncomeRequest,
  auth: RecurringIncomeAuth,
): Promise<NidoResult<{ id: string }>> {
  const userId = await auth.getUserId();
  if (!userId) return nidoFail("unauthenticated");

  const payload = buildCreateRecurringIncomePayload(input, userId);
  if (payload.ok === false) return nidoFail(payload.error);

  const { data, error } = await auth.rpc("create_recurring_income", {
    p_household_id: payload.data.householdId,
    p_category_id: payload.data.categoryId,
    p_amount: payload.data.amount,
    p_description: payload.data.description,
    p_start_date: payload.data.startDate,
    p_frequency: payload.data.frequency,
    p_end_date: payload.data.endDate,
  });

  if (error) return nidoFail(nidoErrorFromUnknown(error).code);
  if (!data) return nidoFail("network");
  return nidoOk({ id: data });
}

export function canSubmitRecurrence(submitting: boolean): boolean {
  return !submitting;
}
