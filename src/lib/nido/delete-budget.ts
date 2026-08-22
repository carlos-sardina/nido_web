import { nidoErrorFromUnknown, nidoFail, nidoOk, type NidoResult } from "./errors.ts";

export type DeleteBudgetAuth = {
  getUserId: () => Promise<string | null>;
  rpc: (
    fn: "soft_delete_budget",
    args: Record<string, unknown>,
  ) => Promise<{ data: string | null; error: unknown }>;
};

export async function deleteBudgetWithAuth(
  budgetId: string,
  auth: DeleteBudgetAuth,
): Promise<NidoResult<{ id: string }>> {
  const userId = await auth.getUserId();
  if (!userId) return nidoFail("unauthenticated");
  if (!budgetId) return nidoFail("budget_not_found");

  const { data, error } = await auth.rpc("soft_delete_budget", {
    p_budget_id: budgetId,
  });

  if (error) return nidoFail(nidoErrorFromUnknown(error).code);
  if (!data) return nidoFail("network");
  return nidoOk({ id: data });
}
