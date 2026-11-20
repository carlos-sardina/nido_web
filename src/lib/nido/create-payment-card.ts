import { nidoErrorFromUnknown, nidoFail, nidoOk, type NidoResult } from "./errors.ts";
import {
  buildCreatePaymentCardPayload,
  type CreatePaymentCardRequest,
} from "./financial/compras-input.ts";

export type { CreatePaymentCardRequest };

export type CreatePaymentCardAuth = {
  getUserId: () => Promise<string | null>;
  rpc: (
    fn: "create_payment_card",
    args: Record<string, unknown>,
  ) => Promise<{ data: string | null; error: unknown }>;
};

export async function createPaymentCardWithAuth(
  input: CreatePaymentCardRequest,
  auth: CreatePaymentCardAuth,
): Promise<NidoResult<{ id: string }>> {
  const userId = await auth.getUserId();
  if (!userId) return nidoFail("unauthenticated");

  const payload = buildCreatePaymentCardPayload(input);
  if (payload.ok === false) return nidoFail(payload.error);

  const { data, error } = await auth.rpc("create_payment_card", {
    p_household_id: payload.data.householdId,
    p_owner_member_id: payload.data.ownerMemberId,
    p_label: payload.data.label,
    p_bank: payload.data.bank,
    p_last_four: payload.data.lastFour,
    p_cut_day: payload.data.cutDay,
    p_payment_day: payload.data.paymentDay,
  });

  if (error) return nidoFail(nidoErrorFromUnknown(error).code);
  if (!data) return nidoFail("network");
  return nidoOk({ id: data });
}
