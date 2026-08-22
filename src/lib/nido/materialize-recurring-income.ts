import { nidoErrorFromUnknown, nidoFail, nidoOk, type NidoResult } from "./errors.ts";
import { isCalendarDate } from "./financial/dates.ts";
import type { RecurringIncomeAuth } from "./create-recurring-income.ts";

export async function materializeRecurringIncomeWithAuth(
  recurringId: string,
  occurredAt: string,
  auth: RecurringIncomeAuth,
): Promise<NidoResult<{ id: string }>> {
  const userId = await auth.getUserId();
  if (!userId) return nidoFail("unauthenticated");
  if (!recurringId) return nidoFail("recurrence_not_found");
  if (!isCalendarDate(occurredAt)) return nidoFail("invalid_date");

  const { data, error } = await auth.rpc("materialize_recurring_income", {
    p_recurring_id: recurringId,
    p_occurred_at: occurredAt,
  });

  if (error) return nidoFail(nidoErrorFromUnknown(error).code);
  if (!data) return nidoFail("network");
  return nidoOk({ id: data });
}
