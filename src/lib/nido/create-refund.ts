import { nidoErrorFromUnknown, nidoFail, nidoOk, type NidoResult } from "./errors.ts";
import {
  buildCreateRefundPayload,
  type CreateRefundRequest,
} from "./financial/refund-input.ts";

export type { CreateRefundRequest };

export type CreateRefundAuth = {
  getUserId: () => Promise<string | null>;
  rpc: (
    fn: "create_expense_refund",
    args: Record<string, unknown>,
  ) => Promise<{ data: string | null; error: unknown }>;
};

/**
 * Domain mutation used by createRefund().
 * The client sends only expense_id and amount. Splits are generated
 * in the RPC. Auth adapter keeps unit tests off the browser client.
 */
export async function createRefundWithAuth(
  input: CreateRefundRequest,
  auth: CreateRefundAuth,
): Promise<NidoResult<{ id: string }>> {
  const userId = await auth.getUserId();
  if (!userId) return nidoFail("unauthenticated");

  const payload = buildCreateRefundPayload(input);
  if (payload.ok === false) return nidoFail(payload.error);

  const { data, error } = await auth.rpc("create_expense_refund", {
    p_expense_id: payload.data.expenseId,
    p_amount: payload.data.amount,
  });

  if (error) return nidoFail(nidoErrorFromUnknown(error).code);
  if (!data) return nidoFail("network");
  return nidoOk({ id: data });
}

export function canSubmitRefund(submitting: boolean): boolean {
  return !submitting;
}
