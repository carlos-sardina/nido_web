import { nidoErrorFromUnknown, nidoFail, nidoOk, type NidoResult } from "./errors.ts";

export type DeleteIncomeAuth = {
  getUserId: () => Promise<string | null>;
  rpc: (
    fn: "soft_delete_income",
    args: Record<string, unknown>,
  ) => Promise<{ data: string | null; error: unknown }>;
};

export async function deleteIncomeWithAuth(
  incomeId: string,
  auth: DeleteIncomeAuth,
): Promise<NidoResult<{ id: string }>> {
  const userId = await auth.getUserId();
  if (!userId) return nidoFail("unauthenticated");
  if (!incomeId) return nidoFail("income_not_found");

  const { data, error } = await auth.rpc("soft_delete_income", {
    p_income_id: incomeId,
  });

  if (error) return nidoFail(nidoErrorFromUnknown(error).code);
  if (!data) return nidoFail("network");
  return nidoOk({ id: data });
}
