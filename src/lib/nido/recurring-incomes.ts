import { nidoClient, requireUser, type NidoClient } from "./session";
import { nidoFail, type NidoResult } from "./errors";
import {
  canSubmitRecurrence,
  createRecurringIncomeWithAuth,
  type CreateRecurringIncomeRequest,
} from "./create-recurring-income.ts";
import { materializeRecurringIncomeWithAuth } from "./materialize-recurring-income.ts";
import { setRecurringIncomeActiveWithAuth } from "./set-recurring-income-active.ts";
import {
  updateRecurringIncomeWithAuth,
  type UpdateRecurringIncomeRequest,
} from "./update-recurring-income.ts";
import type { RecurringIncomeAuth } from "./create-recurring-income.ts";

export type { CreateRecurringIncomeRequest, UpdateRecurringIncomeRequest };
export { canSubmitRecurrence };

function incomeAuth(supabase: NidoClient): Promise<NidoResult<RecurringIncomeAuth>> {
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

export async function createRecurringIncome(
  input: CreateRecurringIncomeRequest,
  supabase: NidoClient = nidoClient(),
): Promise<NidoResult<{ id: string }>> {
  const auth = await incomeAuth(supabase);
  if (auth.ok === false) return nidoFail(auth.error.code);
  return createRecurringIncomeWithAuth(input, auth.data);
}

export async function updateRecurringIncome(
  input: UpdateRecurringIncomeRequest,
  supabase: NidoClient = nidoClient(),
): Promise<NidoResult<{ id: string }>> {
  const auth = await incomeAuth(supabase);
  if (auth.ok === false) return nidoFail(auth.error.code);
  return updateRecurringIncomeWithAuth(input, auth.data);
}

export async function setRecurringIncomeActive(
  recurringId: string,
  isActive: boolean,
  supabase: NidoClient = nidoClient(),
): Promise<NidoResult<{ id: string }>> {
  const auth = await incomeAuth(supabase);
  if (auth.ok === false) return nidoFail(auth.error.code);
  return setRecurringIncomeActiveWithAuth(recurringId, isActive, auth.data);
}

export async function materializeRecurringIncome(
  recurringId: string,
  occurredAt: string,
  supabase: NidoClient = nidoClient(),
): Promise<NidoResult<{ id: string }>> {
  const auth = await incomeAuth(supabase);
  if (auth.ok === false) return nidoFail(auth.error.code);
  return materializeRecurringIncomeWithAuth(recurringId, occurredAt, auth.data);
}
