import { nidoErrorFromUnknown, nidoFail, nidoOk, type NidoResult } from "./errors.ts";

export type DeleteExpenseAuth = {
  getUserId: () => Promise<string | null>;
  rpc: (
    fn: "soft_delete_expense",
    args: Record<string, unknown>,
  ) => Promise<{ data: string | null; error: unknown }>;
};

export async function deleteExpenseWithAuth(
  expenseId: string,
  auth: DeleteExpenseAuth,
): Promise<NidoResult<{ id: string }>> {
  const userId = await auth.getUserId();
  if (!userId) return nidoFail("unauthenticated");
  if (!expenseId) return nidoFail("expense_not_found");

  const { data, error } = await auth.rpc("soft_delete_expense", {
    p_expense_id: expenseId,
  });

  if (error) return nidoFail(nidoErrorFromUnknown(error).code);
  if (!data) return nidoFail("network");
  return nidoOk({ id: data });
}
