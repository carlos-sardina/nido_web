import { nidoClient, requireUser, type NidoClient } from "./session";
import { nidoFail, type NidoResult } from "./errors";
import {
  canSubmitBalancePayment,
  confirmMonthlyBalanceWithAuth,
} from "./confirm-monthly-balance.ts";

export { canSubmitBalancePayment };

export async function confirmMonthlyBalance(
  input: { year: number; month: number },
  supabase: NidoClient = nidoClient(),
): Promise<NidoResult<{ paid: boolean }>> {
  const auth = await requireUser(supabase);
  if (auth.ok === false) return nidoFail(auth.error.code);

  return confirmMonthlyBalanceWithAuth(input, {
    getUserId: async () => auth.data.user.id,
    rpc: async (fn, args) => auth.data.supabase.rpc(fn, args as never),
  });
}
