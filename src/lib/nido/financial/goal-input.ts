import type { NidoErrorCode } from "../types.ts";
import { isCalendarDate } from "./dates.ts";
import {
  amountToExpenseInput,
  expenseAmountMessage,
  parseExpenseAmountInput,
} from "./expense-input.ts";
import { MAX_MONEY_AMOUNT, roundMoney } from "./money.ts";
import type { GoalType } from "./types.ts";

export const GOAL_NAME_MAX = 80;
export const GOAL_DESCRIPTION_MAX = 160;

export type CreateGoalRequest = {
  householdId: string;
  name: string;
  amount: number;
  goalType: GoalType;
  targetDate: string | null;
  description: string;
  activeMemberIds: readonly string[];
};

export type CreateGoalPayload = {
  householdId: string;
  name: string;
  amount: number;
  goalType: GoalType;
  targetDate: string | null;
  description: string | null;
};

export function amountToGoalInput(amount: number): string {
  return amountToExpenseInput(amount);
}

export function parseGoalAmountInput(raw: string | null | undefined): number | null {
  return parseExpenseAmountInput(raw);
}

export function goalAmountMessage(raw: string): string | null {
  return expenseAmountMessage(raw);
}

export function normalizeGoalName(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return null;
  if (Array.from(trimmed).length > GOAL_NAME_MAX) return null;
  return trimmed;
}

export function goalNameMessage(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return "Ingresa el nombre de la meta.";
  if (Array.from(trimmed).length > GOAL_NAME_MAX) {
    return `El nombre debe tener ${GOAL_NAME_MAX} caracteres o menos.`;
  }
  return null;
}

export function normalizeGoalDescription(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return null;
  if (Array.from(trimmed).length > GOAL_DESCRIPTION_MAX) return null;
  return trimmed;
}

export function goalDescriptionMessage(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (Array.from(trimmed).length > GOAL_DESCRIPTION_MAX) {
    return `La descripción debe tener ${GOAL_DESCRIPTION_MAX} caracteres o menos.`;
  }
  return null;
}

export function goalDateMessage(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!isCalendarDate(trimmed)) return "La fecha no es válida.";
  return null;
}

export function isGoalType(value: string | null | undefined): value is GoalType {
  return value === "saving" || value === "purchase";
}

export function buildCreateGoalPayload(
  input: CreateGoalRequest,
  userId: string,
): { ok: true; data: CreateGoalPayload } | { ok: false; error: NidoErrorCode } {
  if (!input.householdId) return { ok: false, error: "not_a_member" };
  if (!userId) return { ok: false, error: "unauthenticated" };
  if (!input.activeMemberIds.includes(userId)) return { ok: false, error: "not_a_member" };

  const name = normalizeGoalName(input.name);
  if (!name) return { ok: false, error: "invalid_name" };

  const amount = roundMoney(input.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_MONEY_AMOUNT) {
    return { ok: false, error: "invalid_amount" };
  }

  if (!isGoalType(input.goalType)) return { ok: false, error: "invalid_name" };

  let targetDate: string | null = null;
  if (input.targetDate != null && input.targetDate.trim()) {
    if (!isCalendarDate(input.targetDate.trim())) return { ok: false, error: "invalid_date" };
    targetDate = input.targetDate.trim();
  }

  const descriptionInput = input.description?.trim() ?? "";
  if (descriptionInput && Array.from(descriptionInput).length > GOAL_DESCRIPTION_MAX) {
    return { ok: false, error: "invalid_description" };
  }
  const description = normalizeGoalDescription(input.description);

  return {
    ok: true,
    data: {
      householdId: input.householdId,
      name,
      amount,
      goalType: input.goalType,
      targetDate,
      description,
    },
  };
}
