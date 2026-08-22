import type { NidoErrorCode } from "../types.ts";
import { isCalendarDate } from "./dates.ts";
import {
  amountToExpenseInput,
  expenseAmountMessage,
  parseExpenseAmountInput,
} from "./expense-input.ts";
import { MAX_MONEY_AMOUNT, roundMoney } from "./money.ts";

export type CreateContributionRequest = {
  householdId: string;
  goalId: string;
  amount: number;
  contributedAt: string;
  activeMemberIds: readonly string[];
  allowedGoalIds: readonly string[];
};

export type CreateContributionPayload = {
  goalId: string;
  amount: number;
  contributedAt: string;
};

export function parseContributionAmountInput(
  raw: string | null | undefined,
): number | null {
  return parseExpenseAmountInput(raw);
}

export function amountToContributionInput(amount: number): string {
  return amountToExpenseInput(amount);
}

export function contributionAmountMessage(raw: string): string | null {
  return expenseAmountMessage(raw);
}

export function contributionDateMessage(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || !isCalendarDate(trimmed)) return "La fecha no es válida.";
  return null;
}

export function buildCreateContributionPayload(
  input: CreateContributionRequest,
  userId: string,
): { ok: true; data: CreateContributionPayload } | { ok: false; error: NidoErrorCode } {
  if (!input.householdId) return { ok: false, error: "not_a_member" };
  if (!userId) return { ok: false, error: "unauthenticated" };
  if (!input.activeMemberIds.includes(userId)) return { ok: false, error: "not_a_member" };

  if (!input.goalId || !input.allowedGoalIds.includes(input.goalId)) {
    return { ok: false, error: "goal_not_found" };
  }

  const amount = roundMoney(input.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_MONEY_AMOUNT) {
    return { ok: false, error: "invalid_amount" };
  }

  if (!isCalendarDate(input.contributedAt)) return { ok: false, error: "invalid_date" };

  return {
    ok: true,
    data: {
      goalId: input.goalId,
      amount,
      contributedAt: input.contributedAt,
    },
  };
}
