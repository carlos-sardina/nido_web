import type { NidoErrorCode } from "../types.ts";
import {
  isCalendarDate,
  isCalendarMonthRange,
  monthRangeFromIsoDate,
  type MonthRange,
} from "./dates.ts";
import {
  amountToExpenseInput,
  expenseAmountMessage,
  parseExpenseAmountInput,
} from "./expense-input.ts";
import { MAX_MONEY_AMOUNT, roundMoney } from "./money.ts";

export type CreateBudgetRequest = {
  householdId: string;
  categoryId: string;
  amount: number;
  startDate: string;
  activeMemberIds: readonly string[];
  allowedCategoryIds: readonly string[];
};

export type CreateBudgetPayload = {
  householdId: string;
  categoryId: string;
  amount: number;
  startDate: string;
  endDate: string;
};

export function parseBudgetAmountInput(
  raw: string | null | undefined,
): number | null {
  return parseExpenseAmountInput(raw);
}

export function amountToBudgetInput(amount: number): string {
  return amountToExpenseInput(amount);
}

export function budgetAmountMessage(raw: string): string | null {
  return expenseAmountMessage(raw);
}

/** Accepts `YYYY-MM` (month input) or `YYYY-MM-DD` (any day in the month). */
export function parseBudgetMonthInput(raw: string | null | undefined): MonthRange | null {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return null;

  if (/^\d{4}-\d{2}$/.test(trimmed)) {
    return monthRangeFromIsoDate(`${trimmed}-01`);
  }

  return monthRangeFromIsoDate(trimmed);
}

export function budgetMonthInput(startDate: string): string {
  return startDate.slice(0, 7);
}

export function budgetDateMessage(raw: string): string | null {
  if (!parseBudgetMonthInput(raw)) return "El periodo no es válido.";
  return null;
}

export function budgetRangeMessage(startDate: string, endDate: string): string | null {
  if (!isCalendarDate(startDate) || !isCalendarDate(endDate)) return "El periodo no es válido.";
  if (endDate < startDate) return "El periodo no es válido.";
  if (!isCalendarMonthRange(startDate, endDate)) return "El periodo no es válido.";
  return null;
}

/**
 * Domain payload for create/update. created_by and member_id are never
 * taken from the client; the RPC derives created_by from auth.uid() and
 * always writes a Nido-level budget (member_id NULL).
 */
export function buildCreateBudgetPayload(
  input: CreateBudgetRequest,
  userId: string,
): { ok: true; data: CreateBudgetPayload } | { ok: false; error: NidoErrorCode } {
  if (!input.householdId) return { ok: false, error: "not_a_member" };
  if (!userId) return { ok: false, error: "unauthenticated" };
  if (!input.activeMemberIds.includes(userId)) return { ok: false, error: "not_a_member" };

  const amount = roundMoney(input.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_MONEY_AMOUNT) {
    return { ok: false, error: "invalid_amount" };
  }

  const range = monthRangeFromIsoDate(input.startDate);
  if (!range) return { ok: false, error: "invalid_date" };

  if (!input.categoryId || !input.allowedCategoryIds.includes(input.categoryId)) {
    return { ok: false, error: "invalid_category" };
  }

  return {
    ok: true,
    data: {
      householdId: input.householdId,
      categoryId: input.categoryId,
      amount,
      startDate: range.start,
      endDate: range.end,
    },
  };
}
