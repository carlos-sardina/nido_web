import {
  buildMsiInstallmentPlan,
  DEFAULT_PURCHASE_EMOJI,
  msiFirstDueDate,
  resolvePurchaseEmoji,
  type PaymentCardRow,
  type PurchaseBonusInput,
  type PurchaseBonusType,
  type PurchasePaymentMethod,
  type PurchaseShareInput,
} from "./compras.ts";
import { emojiFromInput } from "./category-icon.ts";
import { isCalendarDate } from "./dates.ts";
import { MAX_MONEY_AMOUNT, roundMoney } from "./money.ts";

export const PURCHASE_NAME_MAX = 80;
export const PURCHASE_DESCRIPTION_MAX = 200;
export const PURCHASE_STORE_MAX = 80;
export const CARD_LABEL_MAX = 60;
export const CARD_BANK_MAX = 40;

export type CreatePaymentCardRequest = {
  householdId: string;
  ownerMemberId: string;
  label: string;
  bank?: string | null;
  lastFour?: string | null;
  cutDay: number;
  paymentDay: number;
  activeMemberIds: string[];
};

export type CreatePurchaseRequest = {
  householdId: string;
  name: string;
  emoji?: string | null;
  description?: string | null;
  store?: string | null;
  purchasedAt: string;
  grossAmount: number;
  paymentMethod: PurchasePaymentMethod;
  msiMonths?: number | null;
  cardId?: string | null;
  firstDueDate?: string | null;
  shares: PurchaseShareInput[];
  bonuses?: PurchaseBonusInput[];
  cards?: PaymentCardRow[];
  activeMemberIds: string[];
};

export type CreatePurchasePayload = {
  householdId: string;
  name: string;
  emoji: string;
  description: string | null;
  store: string | null;
  purchasedAt: string;
  grossAmount: number;
  paymentMethod: PurchasePaymentMethod;
  msiMonths: number | null;
  cardId: string | null;
  firstDueDate: string | null;
  shares: PurchaseShareInput[];
  bonuses: PurchaseBonusInput[];
};

type Fail<T extends string> = { ok: false; error: T };
type Ok<T> = { ok: true; data: T };

function trimOrNull(value: string | null | undefined, max: number): string | null | Fail<"invalid_name" | "invalid_description"> {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  if (trimmed.length > max) {
    return { ok: false, error: trimmed.length > 200 ? "invalid_description" : "invalid_name" };
  }
  return trimmed;
}

export function purchaseNameMessage(raw: string): string | null {
  const name = raw.trim();
  if (!name) return "Escribe el nombre de la compra.";
  if (name.length > PURCHASE_NAME_MAX) return `Máximo ${PURCHASE_NAME_MAX} caracteres.`;
  return null;
}

export function purchaseAmountMessage(amount: number | null): string | null {
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return "Ingresa un monto válido.";
  if (amount > MAX_MONEY_AMOUNT) return "El monto es demasiado grande.";
  return null;
}

export function purchaseDateMessage(raw: string): string | null {
  if (!raw.trim() || !isCalendarDate(raw.trim())) return "La fecha no es válida.";
  return null;
}

export function cardLabelMessage(raw: string): string | null {
  const label = raw.trim();
  if (!label) return "Escribe un nombre para la tarjeta.";
  if (label.length > CARD_LABEL_MAX) return `Máximo ${CARD_LABEL_MAX} caracteres.`;
  return null;
}

export function cardDayMessage(day: number | null, label: string): string | null {
  if (day == null || !Number.isInteger(day) || day < 1 || day > 28) {
    return `${label} debe ser un día entre 1 y 28.`;
  }
  return null;
}

export function lastFourMessage(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (!/^\d{4}$/.test(value)) return "Usa exactamente 4 dígitos.";
  return null;
}

export function sharesMessage(
  shares: PurchaseShareInput[],
  activeMemberIds: string[],
): string | null {
  if (shares.length < 1) return "Indica quién participa y en qué porcentaje.";
  const active = new Set(activeMemberIds);
  let total = 0;
  const seen = new Set<string>();
  for (const share of shares) {
    if (!active.has(share.memberId)) return "Hay un miembro que ya no está en el Nido.";
    if (seen.has(share.memberId)) return "No repitas al mismo miembro.";
    if (!Number.isFinite(share.percent) || share.percent <= 0 || share.percent > 100) {
      return "Cada porcentaje debe ser mayor a 0 y hasta 100.";
    }
    seen.add(share.memberId);
    total += roundMoney(share.percent);
  }
  if (roundMoney(total) !== 100) return "Los porcentajes deben sumar 100%.";
  return null;
}

export function buildCreatePaymentCardPayload(
  input: CreatePaymentCardRequest,
): Ok<{
  householdId: string;
  ownerMemberId: string;
  label: string;
  bank: string | null;
  lastFour: string | null;
  cutDay: number;
  paymentDay: number;
}> | Fail<"invalid_name" | "invalid_date" | "forbidden"> {
  if (!input.activeMemberIds.includes(input.ownerMemberId)) {
    return { ok: false, error: "forbidden" };
  }
  const label = input.label.trim();
  if (!label || label.length > CARD_LABEL_MAX) return { ok: false, error: "invalid_name" };

  const bankRaw = (input.bank ?? "").trim();
  const bank = bankRaw ? bankRaw : null;
  if (bank && bank.length > CARD_BANK_MAX) return { ok: false, error: "invalid_name" };

  const lastFourRaw = (input.lastFour ?? "").trim();
  const lastFour = lastFourRaw ? lastFourRaw : null;
  if (lastFour && !/^\d{4}$/.test(lastFour)) return { ok: false, error: "invalid_name" };

  if (!Number.isInteger(input.cutDay) || input.cutDay < 1 || input.cutDay > 28) {
    return { ok: false, error: "invalid_date" };
  }
  if (!Number.isInteger(input.paymentDay) || input.paymentDay < 1 || input.paymentDay > 28) {
    return { ok: false, error: "invalid_date" };
  }

  return {
    ok: true,
    data: {
      householdId: input.householdId,
      ownerMemberId: input.ownerMemberId,
      label,
      bank,
      lastFour,
      cutDay: input.cutDay,
      paymentDay: input.paymentDay,
    },
  };
}

export function buildCreatePurchasePayload(
  input: CreatePurchaseRequest,
): Ok<CreatePurchasePayload> | Fail<
  "invalid_name" | "invalid_description" | "invalid_amount" | "invalid_date" | "invalid_split"
> {
  const name = input.name.trim();
  if (!name || name.length > PURCHASE_NAME_MAX) return { ok: false, error: "invalid_name" };

  const descriptionResult = trimOrNull(input.description, PURCHASE_DESCRIPTION_MAX);
  if (descriptionResult && typeof descriptionResult === "object" && descriptionResult.ok === false) {
    return descriptionResult;
  }
  const description = (descriptionResult as string | null) ?? null;

  const storeResult = trimOrNull(input.store, PURCHASE_STORE_MAX);
  if (storeResult && typeof storeResult === "object" && storeResult.ok === false) {
    return storeResult;
  }
  const store = (storeResult as string | null) ?? null;

  if (!isCalendarDate(input.purchasedAt)) return { ok: false, error: "invalid_date" };

  const grossAmount = roundMoney(input.grossAmount);
  if (!Number.isFinite(grossAmount) || grossAmount <= 0 || grossAmount > MAX_MONEY_AMOUNT) {
    return { ok: false, error: "invalid_amount" };
  }

  if (sharesMessage(input.shares, input.activeMemberIds)) {
    return { ok: false, error: "invalid_split" };
  }

  let msiMonths: number | null = null;
  let cardId: string | null = input.cardId ?? null;
  let firstDueDate: string | null = input.firstDueDate?.trim() || null;

  if (input.paymentMethod === "msi") {
    if (
      input.msiMonths == null ||
      !Number.isInteger(input.msiMonths) ||
      input.msiMonths < 1 ||
      input.msiMonths > 48
    ) {
      return { ok: false, error: "invalid_amount" };
    }
    if (!cardId) return { ok: false, error: "invalid_amount" };
    msiMonths = input.msiMonths;

    const card = input.cards?.find((row) => row.id === cardId);
    if (firstDueDate) {
      if (!isCalendarDate(firstDueDate)) return { ok: false, error: "invalid_date" };
    } else if (card) {
      firstDueDate = msiFirstDueDate(input.purchasedAt, card.cutDay, card.paymentDay);
      if (!firstDueDate) return { ok: false, error: "invalid_date" };
    }

    if (firstDueDate && msiMonths) {
      const plan = buildMsiInstallmentPlan(grossAmount, msiMonths, firstDueDate);
      if (plan.length !== msiMonths) return { ok: false, error: "invalid_amount" };
    }
  } else {
    msiMonths = null;
    firstDueDate = null;
    cardId = null;
  }

  const bonuses: PurchaseBonusInput[] = [];
  for (const bonus of input.bonuses ?? []) {
    const label = bonus.label.trim();
    if (!label || label.length > PURCHASE_NAME_MAX) return { ok: false, error: "invalid_name" };
    const amount = roundMoney(bonus.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_MONEY_AMOUNT) {
      return { ok: false, error: "invalid_amount" };
    }
    if (!isCalendarDate(bonus.expectedAt)) return { ok: false, error: "invalid_date" };
    const notes = (bonus.notes ?? "").trim() || null;
    if (notes && notes.length > PURCHASE_DESCRIPTION_MAX) {
      return { ok: false, error: "invalid_description" };
    }
    bonuses.push({
      bonusType: bonus.bonusType,
      label,
      amount,
      expectedAt: bonus.expectedAt,
      notes,
    });
  }

  const emoji = resolvePurchaseEmoji(
    emojiFromInput(input.emoji ?? "", DEFAULT_PURCHASE_EMOJI),
  );

  return {
    ok: true,
    data: {
      householdId: input.householdId,
      name,
      emoji,
      description,
      store,
      purchasedAt: input.purchasedAt,
      grossAmount,
      paymentMethod: input.paymentMethod,
      msiMonths,
      cardId,
      firstDueDate,
      shares: input.shares.map((share) => ({
        memberId: share.memberId,
        percent: roundMoney(share.percent),
      })),
      bonuses,
    },
  };
}

export function isPurchaseBonusType(value: string): value is PurchaseBonusType {
  return value === "cashback" || value === "deferred_discount";
}
