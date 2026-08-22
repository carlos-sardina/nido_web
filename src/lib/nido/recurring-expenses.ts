import { nidoClient, requireUser, type NidoClient } from "./session";
import { nidoFail, type NidoResult } from "./errors";
import { canSubmitRecurrence } from "./create-recurring-income.ts";
import {
  createRecurringExpenseWithAuth,
  type CreateRecurringExpenseRequest,
  type RecurringExpenseAuth,
} from "./create-recurring-expense.ts";
import { materializeRecurringExpenseWithAuth } from "./materialize-recurring-expense.ts";
import { setRecurringExpenseActiveWithAuth } from "./set-recurring-expense-active.ts";
import {
  updateRecurringExpenseWithAuth,
  type UpdateRecurringExpenseRequest,
} from "./update-recurring-expense.ts";

export type { CreateRecurringExpenseRequest, UpdateRecurringExpenseRequest };
export { canSubmitRecurrence };

function expenseAuth(supabase: NidoClient): Promise<NidoResult<RecurringExpenseAuth>> {
  return requireUser(supabase).then((auth) => {
    if (auth.ok === false) return nidoFail(auth.error.code);
    return {
      ok: true as const,
      data: {
        getUserId: async () => auth.data.user.id,
        rpc: async (fn, args) => auth.data.supabase.rpc(fn, args as never),
      },
    };
  });
}

export async function createRecurringExpense(
  input: CreateRecurringExpenseRequest,
  supabase: NidoClient = nidoClient(),
): Promise<NidoResult<{ id: string }>> {
  const auth = await expenseAuth(supabase);
  if (auth.ok === false) return nidoFail(auth.error.code);
  return createRecurringExpenseWithAuth(input, auth.data);
}

export async function updateRecurringExpense(
  input: UpdateRecurringExpenseRequest,
  supabase: NidoClient = nidoClient(),
): Promise<NidoResult<{ id: string }>> {
  const auth = await expenseAuth(supabase);
  if (auth.ok === false) return nidoFail(auth.error.code);
  return updateRecurringExpenseWithAuth(input, auth.data);
}

export async function setRecurringExpenseActive(
  recurringId: string,
  isActive: boolean,
  supabase: NidoClient = nidoClient(),
): Promise<NidoResult<{ id: string }>> {
  const auth = await expenseAuth(supabase);
  if (auth.ok === false) return nidoFail(auth.error.code);
  return setRecurringExpenseActiveWithAuth(recurringId, isActive, auth.data);
}

export async function materializeRecurringExpense(
  recurringId: string,
  occurredAt: string,
  supabase: NidoClient = nidoClient(),
): Promise<NidoResult<{ id: string }>> {
  const auth = await expenseAuth(supabase);
  if (auth.ok === false) return nidoFail(auth.error.code);
  return materializeRecurringExpenseWithAuth(recurringId, occurredAt, auth.data);
}
