import type { NidoErrorCode } from "../types.ts";
import { currentMonthDateMessage, isCurrentMonthDate } from "./dates.ts";
import {
  amountToExpenseInput,
  expenseAmountMessage,
  parseExpenseAmountInput,
} from "./expense-input.ts";
import { MAX_MONEY_AMOUNT, roundMoney } from "./money.ts";

export const INCOME_DESCRIPTION_MAX = 80;

export type CreateIncomeRequest = {
  householdId: string;
  categoryId: string;
  amount: number;
  description: string;
  occurredAt: string;
  activeMemberIds: readonly string[];
  allowedCategoryIds: readonly string[];
};

export type CreateIncomePayload = {
  householdId: string;
  categoryId: string;
  amount: number;
  description: string | null;
  occurredAt: string;
};

export function parseIncomeAmountInput(
  raw: string | null | undefined,
): number | null {
  return parseExpenseAmountInput(raw);
}

export function amountToIncomeInput(amount: number): string {
  return amountToExpenseInput(amount);
}

export function incomeAmountMessage(raw: string): string | null {
  return expenseAmountMessage(raw);
}

export function normalizeIncomeDescription(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return null;
  if (Array.from(trimmed).length > INCOME_DESCRIPTION_MAX) return null;
  return trimmed;
}

export function incomeDescriptionMessage(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (Array.from(trimmed).length > INCOME_DESCRIPTION_MAX) {
    return `La descripción debe tener ${INCOME_DESCRIPTION_MAX} caracteres o menos.`;
  }
  return null;
}

export function incomeDateMessage(raw: string): string | null {
  return currentMonthDateMessage(raw);
}

/**
 * Domain payload for create/update. member_id and created_by are never
 * taken from the client; the RPC derives both from auth.uid().
 */
export function buildCreateIncomePayload(
  input: CreateIncomeRequest,
  userId: string,
): { ok: true; data: CreateIncomePayload } | { ok: false; error: NidoErrorCode } {
  if (!input.householdId) return { ok: false, error: "not_a_member" };
  if (!userId) return { ok: false, error: "unauthenticated" };
  if (!input.activeMemberIds.includes(userId)) return { ok: false, error: "not_a_member" };

  const amount = roundMoney(input.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_MONEY_AMOUNT) {
    return { ok: false, error: "invalid_amount" };
  }

  const descriptionInput = input.description?.trim() ?? "";
  if (descriptionInput && Array.from(descriptionInput).length > INCOME_DESCRIPTION_MAX) {
    return { ok: false, error: "invalid_description" };
  }
  const description = normalizeIncomeDescription(input.description);

  if (!isCurrentMonthDate(input.occurredAt)) return { ok: false, error: "invalid_date" };

  if (!input.categoryId || !input.allowedCategoryIds.includes(input.categoryId)) {
    return { ok: false, error: "invalid_category" };
  }

  return {
    ok: true,
    data: {
      householdId: input.householdId,
      categoryId: input.categoryId,
      amount,
      description,
      occurredAt: input.occurredAt,
    },
  };
}
