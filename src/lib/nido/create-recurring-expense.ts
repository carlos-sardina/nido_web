import { nidoErrorFromUnknown, nidoFail, nidoOk, type NidoResult } from "./errors.ts";
import {
  buildCreateRecurringExpensePayload,
  type CreateRecurringExpenseRequest,
} from "./financial/recurrence-input.ts";

export type { CreateRecurringExpenseRequest };

export type RecurringExpenseAuth = {
  getUserId: () => Promise<string | null>;
  rpc: (
    fn:
      | "create_recurring_expense"
      | "update_recurring_expense"
      | "set_recurring_expense_active"
      | "materialize_recurring_expense",
    args: Record<string, unknown>,
  ) => Promise<{ data: string | null; error: unknown }>;
};

export async function createRecurringExpenseWithAuth(
  input: CreateRecurringExpenseRequest,
  auth: RecurringExpenseAuth,
): Promise<NidoResult<{ id: string }>> {
  const userId = await auth.getUserId();
  if (!userId) return nidoFail("unauthenticated");

  const payload = buildCreateRecurringExpensePayload(input, userId);
  if (payload.ok === false) return nidoFail(payload.error);

  const { data, error } = await auth.rpc("create_recurring_expense", {
    p_household_id: payload.data.householdId,
    p_category_id: payload.data.categoryId,
    p_amount: payload.data.amount,
    p_description: payload.data.description,
    p_start_date: payload.data.startDate,
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
