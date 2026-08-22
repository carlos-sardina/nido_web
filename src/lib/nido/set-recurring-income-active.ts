import { nidoErrorFromUnknown, nidoFail, nidoOk, type NidoResult } from "./errors.ts";
import type { RecurringIncomeAuth } from "./create-recurring-income.ts";

export async function setRecurringIncomeActiveWithAuth(
  recurringId: string,
  isActive: boolean,
  auth: RecurringIncomeAuth,
): Promise<NidoResult<{ id: string }>> {
  const userId = await auth.getUserId();
  if (!userId) return nidoFail("unauthenticated");
  if (!recurringId) return nidoFail("recurrence_not_found");

  const { data, error } = await auth.rpc("set_recurring_income_active", {
    p_recurring_id: recurringId,
    p_is_active: isActive,
  });

  if (error) return nidoFail(nidoErrorFromUnknown(error).code);
  if (!data) return nidoFail("network");
  return nidoOk({ id: data });
}
