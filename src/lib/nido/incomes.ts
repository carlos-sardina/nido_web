import { nidoClient, requireUser, type NidoClient } from "./session";
import { nidoFail, type NidoResult } from "./errors";
import {
  canSubmitIncome,
  createIncomeWithAuth,
  type CreateIncomeRequest,
} from "./create-income.ts";
import { deleteIncomeWithAuth } from "./delete-income.ts";
import {
  updateIncomeWithAuth,
  type UpdateIncomeRequest,
} from "./update-income.ts";

export type { CreateIncomeRequest, UpdateIncomeRequest };
export { canSubmitIncome };

export async function createIncome(
  input: CreateIncomeRequest,
  supabase: NidoClient = nidoClient(),
): Promise<NidoResult<{ id: string }>> {
  const auth = await requireUser(supabase);
  if (auth.ok === false) return nidoFail(auth.error.code);

  return createIncomeWithAuth(input, {
    getUserId: async () => auth.data.user.id,
    rpc: async (fn, args) => auth.data.supabase.rpc(fn, args as never),
  });
}

export async function updateIncome(
  input: UpdateIncomeRequest,
  supabase: NidoClient = nidoClient(),
): Promise<NidoResult<{ id: string }>> {
  const auth = await requireUser(supabase);
  if (auth.ok === false) return nidoFail(auth.error.code);

  return updateIncomeWithAuth(input, {
    getUserId: async () => auth.data.user.id,
    rpc: async (fn, args) => auth.data.supabase.rpc(fn, args as never),
  });
}

export async function deleteIncome(
  incomeId: string,
  supabase: NidoClient = nidoClient(),
): Promise<NidoResult<{ id: string }>> {
  const auth = await requireUser(supabase);
  if (auth.ok === false) return nidoFail(auth.error.code);

  return deleteIncomeWithAuth(incomeId, {
    getUserId: async () => auth.data.user.id,
    rpc: async (fn, args) => auth.data.supabase.rpc(fn, args as never),
  });
}
