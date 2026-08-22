import { nidoClient, requireUser, type NidoClient } from "./session";
import { nidoFail, type NidoResult } from "./errors";
import {
  canSubmitBudget,
  createBudgetWithAuth,
  type CreateBudgetRequest,
} from "./create-budget.ts";
import { deleteBudgetWithAuth } from "./delete-budget.ts";
import {
  updateBudgetWithAuth,
  type UpdateBudgetRequest,
} from "./update-budget.ts";

export type { CreateBudgetRequest, UpdateBudgetRequest };
export { canSubmitBudget };

export async function createBudget(
  input: CreateBudgetRequest,
  supabase: NidoClient = nidoClient(),
): Promise<NidoResult<{ id: string }>> {
  const auth = await requireUser(supabase);
  if (auth.ok === false) return nidoFail(auth.error.code);

  return createBudgetWithAuth(input, {
    getUserId: async () => auth.data.user.id,
    rpc: async (fn, args) => auth.data.supabase.rpc(fn, args as never),
  });
}

export async function updateBudget(
  input: UpdateBudgetRequest,
  supabase: NidoClient = nidoClient(),
): Promise<NidoResult<{ id: string }>> {
  const auth = await requireUser(supabase);
  if (auth.ok === false) return nidoFail(auth.error.code);

  return updateBudgetWithAuth(input, {
    getUserId: async () => auth.data.user.id,
    rpc: async (fn, args) => auth.data.supabase.rpc(fn, args as never),
  });
}

export async function deleteBudget(
  budgetId: string,
  supabase: NidoClient = nidoClient(),
): Promise<NidoResult<{ id: string }>> {
  const auth = await requireUser(supabase);
  if (auth.ok === false) return nidoFail(auth.error.code);

  return deleteBudgetWithAuth(budgetId, {
    getUserId: async () => auth.data.user.id,
    rpc: async (fn, args) => auth.data.supabase.rpc(fn, args as never),
  });
}
