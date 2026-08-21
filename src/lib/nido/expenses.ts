import { nidoClient, requireUser, type NidoClient } from "./session";
import { nidoFail, type NidoResult } from "./errors";
import {
  canSubmitExpense,
  createExpenseWithAuth,
  type CreateExpenseRequest,
} from "./create-expense.ts";

export type { CreateExpenseRequest };
export { canSubmitExpense };

export async function createExpense(
  input: CreateExpenseRequest,
  supabase: NidoClient = nidoClient(),
): Promise<NidoResult<{ id: string }>> {
  const auth = await requireUser(supabase);
  if (auth.ok === false) return nidoFail(auth.error.code);

  return createExpenseWithAuth(input, {
    getUserId: async () => auth.data.user.id,
    rpc: async (fn, args) => auth.data.supabase.rpc(fn, args as never),
  });
}
