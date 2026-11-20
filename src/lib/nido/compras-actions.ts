import { nidoClient, requireUser, type NidoClient } from "./session";
import { nidoErrorFromUnknown, nidoFail, nidoOk, type NidoResult } from "./errors";
import {
  createPaymentCardWithAuth,
  type CreatePaymentCardRequest,
} from "./create-payment-card.ts";
import {
  canSubmitPurchase,
  createPurchaseWithAuth,
  type CreatePurchaseRequest,
} from "./create-purchase.ts";
import type { PurchaseBonusType } from "./financial/compras.ts";

export type { CreatePaymentCardRequest, CreatePurchaseRequest };
export { canSubmitPurchase };

export async function createPaymentCard(
  input: CreatePaymentCardRequest,
  supabase: NidoClient = nidoClient(),
): Promise<NidoResult<{ id: string }>> {
  const auth = await requireUser(supabase);
  if (auth.ok === false) return nidoFail(auth.error.code);
  return createPaymentCardWithAuth(input, {
    getUserId: async () => auth.data.user.id,
    rpc: async (fn, args) => auth.data.supabase.rpc(fn, args as never),
  });
}

export async function createPurchase(
  input: CreatePurchaseRequest,
  supabase: NidoClient = nidoClient(),
): Promise<NidoResult<{ id: string }>> {
  const auth = await requireUser(supabase);
  if (auth.ok === false) return nidoFail(auth.error.code);
  return createPurchaseWithAuth(input, {
    getUserId: async () => auth.data.user.id,
    rpc: async (fn, args) => auth.data.supabase.rpc(fn, args as never),
  });
}

export async function softDeletePurchase(
  purchaseId: string,
  supabase: NidoClient = nidoClient(),
): Promise<NidoResult<{ id: string }>> {
  const auth = await requireUser(supabase);
  if (auth.ok === false) return nidoFail(auth.error.code);
  const { data, error } = await auth.data.supabase.rpc("soft_delete_purchase", {
    p_purchase_id: purchaseId,
  });
  if (error) return nidoFail(nidoErrorFromUnknown(error).code);
  if (!data) return nidoFail("network");
  return nidoOk({ id: data });
}

export async function softDeletePaymentCard(
  cardId: string,
  supabase: NidoClient = nidoClient(),
): Promise<NidoResult<{ id: string }>> {
  const auth = await requireUser(supabase);
  if (auth.ok === false) return nidoFail(auth.error.code);
  const { data, error } = await auth.data.supabase.rpc("soft_delete_payment_card", {
    p_card_id: cardId,
  });
  if (error) {
    const mapped = nidoErrorFromUnknown(error);
    // RPC raises nido.conflict (or nido.card_in_use) when the card still has live purchases.
    if (mapped.code === "conflict" || mapped.code === "card_in_use") {
      return nidoFail("card_in_use");
    }
    return nidoFail(mapped.code);
  }
  if (!data) return nidoFail("network");
  return nidoOk({ id: data });
}

export async function markInstallmentPaid(
  installmentId: string,
  paidAt: string | null,
  supabase: NidoClient = nidoClient(),
): Promise<NidoResult<{ id: string }>> {
  const auth = await requireUser(supabase);
  if (auth.ok === false) return nidoFail(auth.error.code);
  const { data, error } = await auth.data.supabase.rpc("mark_purchase_installment_paid", {
    p_installment_id: installmentId,
    p_paid_at: paidAt,
  });
  if (error) return nidoFail(nidoErrorFromUnknown(error).code);
  if (!data) return nidoFail("network");
  return nidoOk({ id: data });
}

export async function createPurchaseBonus(
  input: {
    purchaseId: string;
    bonusType: PurchaseBonusType;
    label: string;
    amount: number;
    expectedAt: string;
    notes?: string | null;
  },
  supabase: NidoClient = nidoClient(),
): Promise<NidoResult<{ id: string }>> {
  const auth = await requireUser(supabase);
  if (auth.ok === false) return nidoFail(auth.error.code);
  const { data, error } = await auth.data.supabase.rpc("create_purchase_bonus", {
    p_purchase_id: input.purchaseId,
    p_bonus_type: input.bonusType,
    p_label: input.label,
    p_amount: input.amount,
    p_expected_at: input.expectedAt,
    p_notes: input.notes ?? null,
  });
  if (error) return nidoFail(nidoErrorFromUnknown(error).code);
  if (!data) return nidoFail("network");
  return nidoOk({ id: data });
}

export async function updatePurchaseBonus(
  input: {
    bonusId: string;
    label: string;
    amount: number;
    expectedAt: string;
    receivedAt: string | null;
    notes?: string | null;
  },
  supabase: NidoClient = nidoClient(),
): Promise<NidoResult<{ id: string }>> {
  const auth = await requireUser(supabase);
  if (auth.ok === false) return nidoFail(auth.error.code);
  const { data, error } = await auth.data.supabase.rpc("update_purchase_bonus", {
    p_bonus_id: input.bonusId,
    p_label: input.label,
    p_amount: input.amount,
    p_expected_at: input.expectedAt,
    p_received_at: input.receivedAt,
    p_notes: input.notes ?? null,
  });
  if (error) return nidoFail(nidoErrorFromUnknown(error).code);
  if (!data) return nidoFail("network");
  return nidoOk({ id: data });
}

export async function softDeletePurchaseBonus(
  bonusId: string,
  supabase: NidoClient = nidoClient(),
): Promise<NidoResult<{ id: string }>> {
  const auth = await requireUser(supabase);
  if (auth.ok === false) return nidoFail(auth.error.code);
  const { data, error } = await auth.data.supabase.rpc("soft_delete_purchase_bonus", {
    p_bonus_id: bonusId,
  });
  if (error) return nidoFail(nidoErrorFromUnknown(error).code);
  if (!data) return nidoFail("network");
  return nidoOk({ id: data });
}

export type RegisterPurchasePaymentItem = {
  purchaseId: string;
  kind: "installment" | "payoff" | "capital";
  count?: number;
  amount?: number;
};

export async function registerPurchasePayments(
  input: {
    householdId: string;
    memberId: string;
    paidAt: string;
    notes?: string | null;
    items: RegisterPurchasePaymentItem[];
  },
  supabase: NidoClient = nidoClient(),
): Promise<NidoResult<{ ids: string[] }>> {
  const auth = await requireUser(supabase);
  if (auth.ok === false) return nidoFail(auth.error.code);
  if (input.items.length === 0) return nidoFail("invalid_amount");
  const { data, error } = await auth.data.supabase.rpc("register_purchase_payments", {
    p_household_id: input.householdId,
    p_member_id: input.memberId,
    p_paid_at: input.paidAt,
    p_notes: input.notes ?? null,
    p_items: input.items.map((item) => ({
      purchase_id: item.purchaseId,
      kind: item.kind,
      count: item.kind === "installment" ? (item.count ?? 1) : null,
      amount: item.kind === "capital" ? item.amount ?? null : null,
    })),
  });
  if (error) return nidoFail(nidoErrorFromUnknown(error).code);
  if (!data || !Array.isArray(data) || data.length === 0) return nidoFail("network");
  return nidoOk({ ids: data as string[] });
}

export async function softDeletePurchasePayment(
  paymentId: string,
  supabase: NidoClient = nidoClient(),
): Promise<NidoResult<{ id: string }>> {
  const auth = await requireUser(supabase);
  if (auth.ok === false) return nidoFail(auth.error.code);
  const { data, error } = await auth.data.supabase.rpc("soft_delete_purchase_payment", {
    p_payment_id: paymentId,
  });
  if (error) return nidoFail(nidoErrorFromUnknown(error).code);
  if (!data) return nidoFail("network");
  return nidoOk({ id: data });
}
