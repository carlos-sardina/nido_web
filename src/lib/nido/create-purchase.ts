import { nidoErrorFromUnknown, nidoFail, nidoOk, type NidoResult } from "./errors.ts";
import {
  buildCreatePurchasePayload,
  type CreatePurchaseRequest,
} from "./financial/compras-input.ts";

export type { CreatePurchaseRequest };

export type CreatePurchaseAuth = {
  getUserId: () => Promise<string | null>;
  rpc: (
    fn: "create_purchase",
    args: Record<string, unknown>,
  ) => Promise<{ data: string | null; error: unknown }>;
};

export async function createPurchaseWithAuth(
  input: CreatePurchaseRequest,
  auth: CreatePurchaseAuth,
): Promise<NidoResult<{ id: string }>> {
  const userId = await auth.getUserId();
  if (!userId) return nidoFail("unauthenticated");

  const payload = buildCreatePurchasePayload(input);
  if (payload.ok === false) return nidoFail(payload.error);

  const { data, error } = await auth.rpc("create_purchase", {
    p_household_id: payload.data.householdId,
    p_name: payload.data.name,
    p_description: payload.data.description,
    p_store: payload.data.store,
    p_purchased_at: payload.data.purchasedAt,
    p_gross_amount: payload.data.grossAmount,
    p_payment_method: payload.data.paymentMethod,
    p_msi_months: payload.data.msiMonths,
    p_card_id: payload.data.cardId,
    p_first_due_date: payload.data.firstDueDate,
    p_shares: payload.data.shares.map((share) => ({
      member_id: share.memberId,
      percent: share.percent,
    })),
    p_bonuses: payload.data.bonuses.map((bonus) => ({
      bonus_type: bonus.bonusType,
      label: bonus.label,
      amount: bonus.amount,
      expected_at: bonus.expectedAt,
      notes: bonus.notes ?? null,
    })),
    p_emoji: payload.data.emoji,
  });

  if (error) return nidoFail(nidoErrorFromUnknown(error).code);
  if (!data) return nidoFail("network");
  return nidoOk({ id: data });
}

export function canSubmitPurchase(submitting: boolean): boolean {
  return !submitting;
}
