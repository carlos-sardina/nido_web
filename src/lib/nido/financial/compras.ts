import {
  addCalendarMonths,
  clampMonthDay,
  isCalendarDate,
  isoDate,
  shiftMonth,
  type MonthRange,
} from "./dates.ts";
import { MONEY_CENTS, roundMoney, sumMoney } from "./money.ts";

export type PurchasePaymentMethod = "cash" | "msi";
export type PurchaseBonusType = "cashback" | "deferred_discount";

export type PaymentCardRow = {
  id: string;
  householdId: string;
  ownerMemberId: string;
  ownerName: string | null;
  label: string;
  bank: string | null;
  lastFour: string | null;
  cutDay: number;
  paymentDay: number;
  createdBy: string;
  createdAt: string;
};

export type PurchaseShareRow = {
  id: string;
  purchaseId: string;
  memberId: string;
  memberName: string | null;
  percent: number;
};

export type PurchaseInstallmentRow = {
  id: string;
  purchaseId: string;
  installmentNumber: number;
  dueDate: string;
  amount: number;
  paidAt: string | null;
};

export type PurchaseBonusRow = {
  id: string;
  purchaseId: string;
  bonusType: PurchaseBonusType;
  label: string;
  amount: number;
  expectedAt: string;
  receivedAt: string | null;
  notes: string | null;
  createdBy: string;
};

export type PurchasePaymentKind = "installment" | "payoff" | "capital";

export type PurchasePaymentRow = {
  id: string;
  purchaseId: string;
  memberId: string;
  memberName: string | null;
  amount: number;
  paidAt: string;
  kind: PurchasePaymentKind;
  notes: string | null;
  createdBy: string;
  installmentIds: string[];
};

export const DEFAULT_PURCHASE_EMOJI = "🛋️";

export const QUICK_PURCHASE_EMOJIS = [
  "🛋️",
  "🧺",
  "🧊",
  "🔥",
  "📺",
  "🛏️",
  "💡",
  "🍽️",
  "🚿",
  "🧹",
  "🪴",
  "📦",
] as const;

export type PurchaseRow = {
  id: string;
  householdId: string;
  name: string;
  emoji: string | null;
  description: string | null;
  store: string | null;
  purchasedAt: string;
  grossAmount: number;
  paymentMethod: PurchasePaymentMethod;
  msiMonths: number | null;
  cardId: string | null;
  cardLabel: string | null;
  cardOwnerName: string | null;
  createdBy: string;
  createdAt: string;
  shares: PurchaseShareRow[];
  installments: PurchaseInstallmentRow[];
  bonuses: PurchaseBonusRow[];
  payments: PurchasePaymentRow[];
};

export function resolvePurchaseEmoji(emoji: string | null | undefined): string {
  const trimmed = emoji?.trim() ?? "";
  return trimmed || DEFAULT_PURCHASE_EMOJI;
}

export type PurchaseShareInput = {
  memberId: string;
  percent: number;
};

export type PurchaseBonusInput = {
  bonusType: PurchaseBonusType;
  label: string;
  amount: number;
  expectedAt: string;
  notes?: string | null;
};

/** First payment/deposit date after the statement cut that includes the purchase. */
export function msiFirstDueDate(
  purchasedAt: string,
  cutDay: number,
  paymentDay: number,
): string | null {
  if (!isCalendarDate(purchasedAt)) return null;
  if (!Number.isInteger(cutDay) || cutDay < 1 || cutDay > 28) return null;
  if (!Number.isInteger(paymentDay) || paymentDay < 1 || paymentDay > 28) return null;

  const [year, month, day] = purchasedAt.split("-").map(Number);
  const cut =
    day <= cutDay
      ? clampMonthDay(year, month, cutDay)
      : addCalendarMonths(clampMonthDay(year, month, cutDay), 1);
  if (!cut) return null;

  const [cutYear, cutMonth] = cut.split("-").map(Number);
  if (paymentDay > cutDay) {
    return clampMonthDay(cutYear, cutMonth, paymentDay);
  }
  return addCalendarMonths(clampMonthDay(cutYear, cutMonth, paymentDay), 1);
}

export function buildMsiInstallmentPlan(
  grossAmount: number,
  months: number,
  firstDueDate: string,
): { installmentNumber: number; dueDate: string; amount: number }[] {
  if (!Number.isFinite(grossAmount) || grossAmount <= 0) return [];
  if (!Number.isInteger(months) || months < 2) return [];
  if (!isCalendarDate(firstDueDate)) return [];

  const cents = Math.round(roundMoney(grossAmount) * MONEY_CENTS);
  const base = Math.floor(cents / months);
  const rem = cents - base * months;
  const plan: { installmentNumber: number; dueDate: string; amount: number }[] = [];

  for (let i = 1; i <= months; i += 1) {
    const dueDate = addCalendarMonths(firstDueDate, i - 1);
    if (!dueDate) return [];
    const amountCents = i === months ? base + rem : base;
    plan.push({
      installmentNumber: i,
      dueDate,
      amount: amountCents / MONEY_CENTS,
    });
  }
  return plan;
}

export function expectedBonusTotal(bonuses: Pick<PurchaseBonusRow, "amount">[]): number {
  return sumMoney(bonuses.map((bonus) => bonus.amount));
}

export function receivedBonusTotal(
  bonuses: Pick<PurchaseBonusRow, "amount" | "receivedAt">[],
): number {
  return sumMoney(bonuses.filter((bonus) => bonus.receivedAt).map((bonus) => bonus.amount));
}

export function netPurchaseCost(
  grossAmount: number,
  bonuses: Pick<PurchaseBonusRow, "amount">[],
): number {
  return roundMoney(grossAmount - expectedBonusTotal(bonuses));
}

export function pendingInstallmentsDueInRange(
  purchases: PurchaseRow[],
  start: string,
  end: string,
): { purchase: PurchaseRow; installment: PurchaseInstallmentRow }[] {
  const rows: { purchase: PurchaseRow; installment: PurchaseInstallmentRow }[] = [];
  for (const purchase of purchases) {
    for (const installment of purchase.installments) {
      if (installment.paidAt) continue;
      if (installment.dueDate < start || installment.dueDate > end) continue;
      rows.push({ purchase, installment });
    }
  }
  return rows.sort((a, b) => a.installment.dueDate.localeCompare(b.installment.dueDate));
}

/** Nearest month (from `from`, looking ahead) with pending installment dues. */
export function nextPendingDuesMonth(
  purchases: PurchaseRow[],
  from: MonthRange,
  lookAhead = 12,
): { range: MonthRange; amount: number; isCurrent: boolean } {
  for (let offset = 0; offset <= lookAhead; offset += 1) {
    const range = offset === 0 ? from : shiftMonth(from, offset);
    const due = pendingInstallmentsDueInRange(purchases, range.start, range.end);
    const amount = sumMoney(due.map((row) => row.installment.amount));
    if (amount > 0) {
      return { range, amount, isCurrent: offset === 0 };
    }
  }
  return { range: from, amount: 0, isCurrent: true };
}

export function memberCooperationTotals(
  purchases: PurchaseRow[],
  memberIds: string[],
): Record<string, { gross: number; net: number }> {
  const totals: Record<string, { gross: number; net: number }> = {};
  for (const memberId of memberIds) {
    totals[memberId] = { gross: 0, net: 0 };
  }

  for (const purchase of purchases) {
    const net = netPurchaseCost(purchase.grossAmount, purchase.bonuses);
    for (const share of purchase.shares) {
      const bucket = totals[share.memberId] ?? { gross: 0, net: 0 };
      bucket.gross = roundMoney(bucket.gross + (purchase.grossAmount * share.percent) / 100);
      bucket.net = roundMoney(bucket.net + (net * share.percent) / 100);
      totals[share.memberId] = bucket;
    }
  }
  return totals;
}

export function paymentMethodLabel(method: PurchasePaymentMethod): string {
  return method === "msi" ? "MSI" : "Contado";
}

export function bonusTypeLabel(type: PurchaseBonusType): string {
  return type === "cashback" ? "Cashback" : "Descuento diferido";
}

export function cardCaption(card: Pick<PaymentCardRow, "label" | "lastFour" | "ownerName">): string {
  const digits = card.lastFour ? ` · ····${card.lastFour}` : "";
  const owner = card.ownerName ? ` · ${card.ownerName}` : "";
  return `${card.label}${digits}${owner}`;
}

export function sharesCaption(shares: PurchaseShareRow[]): string {
  if (shares.length === 0) return "Sin cooperación";
  return shares
    .map((share) => `${share.memberName ?? "Miembro"} ${roundMoney(share.percent)}%`)
    .join(" · ");
}

export function unpaidInstallments(
  purchase: Pick<PurchaseRow, "installments">,
): PurchaseInstallmentRow[] {
  return purchase.installments.filter((row) => !row.paidAt);
}

export function remainingInstallmentCount(
  purchase: Pick<PurchaseRow, "installments">,
): number {
  return unpaidInstallments(purchase).length;
}

export function remainingInstallmentBalance(
  purchase: Pick<PurchaseRow, "installments">,
): number {
  return sumMoney(unpaidInstallments(purchase).map((row) => row.amount));
}

export function paidInstallmentCount(
  purchase: Pick<PurchaseRow, "installments">,
): number {
  return purchase.installments.filter((row) => row.paidAt).length;
}

export function purchasePaymentsTotal(
  payments: Pick<PurchasePaymentRow, "amount">[],
): number {
  return sumMoney(payments.map((row) => row.amount));
}

/** Remaining deposit for MSI (unpaid installments) or cash (gross − payments). */
export function openPurchaseBalance(
  purchase: Pick<PurchaseRow, "grossAmount" | "installments" | "payments">,
): number {
  const msi = remainingInstallmentBalance(purchase);
  if (msi > 0) return msi;
  return roundMoney(Math.max(0, purchase.grossAmount - purchasePaymentsTotal(purchase.payments)));
}

export function installmentHasLedgerPayment(
  installmentId: string,
  payments: Pick<PurchasePaymentRow, "installmentIds">[],
): boolean {
  return payments.some((payment) => payment.installmentIds.includes(installmentId));
}

export function memberPaymentTotals(
  payments: PurchasePaymentRow[],
): { memberId: string; memberName: string | null; amount: number }[] {
  const map = new Map<string, { memberId: string; memberName: string | null; amount: number }>();
  for (const payment of payments) {
    const current = map.get(payment.memberId) ?? {
      memberId: payment.memberId,
      memberName: payment.memberName,
      amount: 0,
    };
    current.amount = roundMoney(current.amount + payment.amount);
    if (!current.memberName && payment.memberName) current.memberName = payment.memberName;
    map.set(payment.memberId, current);
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount);
}

export function purchasePaymentKindLabel(kind: PurchasePaymentKind): string {
  if (kind === "payoff") return "Desparcializado / contado";
  if (kind === "capital") return "Abono a capital";
  return "Cuota";
}

export type PurchaseAuditAction =
  | "created"
  | "updated"
  | "deleted"
  | "undone"
  | "marked_paid"
  | "marked_unpaid"
  | "received"
  | "unreceived";

export type PurchaseAuditEntity =
  | "purchase"
  | "payment_card"
  | "purchase_payment"
  | "purchase_installment"
  | "purchase_bonus"
  | "purchase_share";

export type PurchaseAuditEvent = {
  id: string;
  householdId: string;
  purchaseId: string | null;
  actorId: string;
  actorName: string | null;
  action: PurchaseAuditAction;
  entityType: PurchaseAuditEntity;
  entityId: string;
  label: string;
  amount: number | null;
  icon: string | null;
  detail: string | null;
  meta: Record<string, unknown>;
  occurredAt: string;
};

export function purchaseAuditActionLabel(action: PurchaseAuditAction): string {
  switch (action) {
    case "created":
      return "Registrado";
    case "updated":
      return "Editado";
    case "deleted":
      return "Eliminado";
    case "undone":
      return "Deshecho";
    case "marked_paid":
      return "Marcado pagado";
    case "marked_unpaid":
      return "Marcado pendiente";
    case "received":
      return "Recibido";
    case "unreceived":
      return "Pendiente otra vez";
    default:
      return action;
  }
}

export function purchaseAuditEntityLabel(entity: PurchaseAuditEntity): string {
  switch (entity) {
    case "purchase":
      return "Compra";
    case "payment_card":
      return "Tarjeta";
    case "purchase_payment":
      return "Pago";
    case "purchase_installment":
      return "Cuota";
    case "purchase_bonus":
      return "Bonificación";
    case "purchase_share":
      return "Participación";
    default:
      return entity;
  }
}

export function remainingMonthsCaption(
  purchase: Pick<PurchaseRow, "installments" | "paymentMethod" | "msiMonths">,
): string | null {
  if (purchase.paymentMethod !== "msi" || purchase.installments.length === 0) return null;
  const remaining = remainingInstallmentCount(purchase);
  if (remaining === 0) return "Liquidada";
  return remaining === 1 ? "1 mensualidad pendiente" : `${remaining} mensualidades pendientes`;
}

/** Re-export helpers used by MSI math when dates module gains them. */
export { isoDate };
