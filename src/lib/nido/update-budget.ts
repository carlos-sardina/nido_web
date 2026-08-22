import { nidoErrorFromUnknown, nidoFail, nidoOk, type NidoResult } from "./errors.ts";
import {
  buildCreateBudgetPayload,
  type CreateBudgetRequest,
} from "./financial/budget-input.ts";

export type UpdateBudgetRequest = CreateBudgetRequest & {
  budgetId: string;
};

export type UpdateBudgetAuth = {
  getUserId: () => Promise<string | null>;
  rpc: (
    fn: "update_budget",
    args: Record<string, unknown>,
  ) => Promise<{ data: string | null; error: unknown }>;
};

export async function updateBudgetWithAuth(
  input: UpdateBudgetRequest,
  auth: UpdateBudgetAuth,
): Promise<NidoResult<{ id: string }>> {
  const userId = await auth.getUserId();
  if (!userId) return nidoFail("unauthenticated");
  if (!input.budgetId) return nidoFail("budget_not_found");

  const payload = buildCreateBudgetPayload(input, userId);
  if (payload.ok === false) return nidoFail(payload.error);

  const { data, error } = await auth.rpc("update_budget", {
    p_budget_id: input.budgetId,
    p_category_id: payload.data.categoryId,
    p_amount: payload.data.amount,
    p_start_date: payload.data.startDate,
    p_end_date: payload.data.endDate,
  });

  if (error) return nidoFail(nidoErrorFromUnknown(error).code);
  if (!data) return nidoFail("network");
  return nidoOk({ id: data });
}
