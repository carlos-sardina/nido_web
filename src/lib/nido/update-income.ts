import { nidoErrorFromUnknown, nidoFail, nidoOk, type NidoResult } from "./errors.ts";
import {
  buildCreateIncomePayload,
  type CreateIncomeRequest,
} from "./financial/income-input.ts";

export type UpdateIncomeRequest = CreateIncomeRequest & {
  incomeId: string;
};

export type UpdateIncomeAuth = {
  getUserId: () => Promise<string | null>;
  rpc: (
    fn: "update_income",
    args: Record<string, unknown>,
  ) => Promise<{ data: string | null; error: unknown }>;
};

export async function updateIncomeWithAuth(
  input: UpdateIncomeRequest,
  auth: UpdateIncomeAuth,
): Promise<NidoResult<{ id: string }>> {
  const userId = await auth.getUserId();
  if (!userId) return nidoFail("unauthenticated");
  if (!input.incomeId) return nidoFail("income_not_found");

  const payload = buildCreateIncomePayload(input, userId);
  if (payload.ok === false) return nidoFail(payload.error);

  const { data, error } = await auth.rpc("update_income", {
    p_income_id: input.incomeId,
    p_category_id: payload.data.categoryId,
    p_amount: payload.data.amount,
    p_description: payload.data.description,
    p_occurred_at: payload.data.occurredAt,
  });

  if (error) return nidoFail(nidoErrorFromUnknown(error).code);
  if (!data) return nidoFail("network");
  return nidoOk({ id: data });
}
