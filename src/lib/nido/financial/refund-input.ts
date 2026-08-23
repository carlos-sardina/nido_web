import type { NidoErrorCode } from "../types.ts";
import { MAX_MONEY_AMOUNT, roundMoney } from "./money.ts";
import { parseExpenseAmountInput } from "./expense-input.ts";
import { validateRefundAmount } from "./refunds.ts";

export type CreateRefundRequest = {
  expenseId: string;
  amount: number;
  refundableRemaining: number;
};

export type CreateRefundPayload = {
  expenseId: string;
  amount: number;
};

export function refundAmountMessage(raw: string, remaining: number): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return "Ingresa un monto válido.";
  const parsed = parseExpenseAmountInput(raw);
  if (parsed == null) return "Ingresa un monto válido.";
  if (parsed === 0) return "Ingresa un monto válido.";
  if (parsed > MAX_MONEY_AMOUNT) return "El monto es demasiado grande.";
  const cap = roundMoney(remaining);
  if (parsed > cap) return "El monto supera lo disponible para devolver.";
  return null;
}

export function buildCreateRefundPayload(
  input: CreateRefundRequest,
): { ok: true; data: CreateRefundPayload } | { ok: false; error: NidoErrorCode } {
  if (!input.expenseId) return { ok: false, error: "expense_not_found" };

  const amount = roundMoney(input.amount);
  const issue = validateRefundAmount(amount, input.refundableRemaining);
  if (issue) return { ok: false, error: issue };

  return { ok: true, data: { expenseId: input.expenseId, amount } };
}
