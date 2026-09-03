import type { NidoErrorCode } from "../types.ts";
import { isCalendarDate } from "./dates.ts";
import {
  amountToExpenseInput,
  expenseAmountMessage,
  parseExpenseAmountInput,
} from "./expense-input.ts";
import {
  incomeDescriptionMessage,
  normalizeIncomeDescription,
} from "./income-input.ts";
import { MAX_MONEY_AMOUNT, roundMoney } from "./money.ts";
import { isRecurrenceFrequency } from "./recurrence.ts";
import type { RecurrenceFrequency } from "./types.ts";

export type CreateRecurringIncomeRequest = {
  householdId: string;
  categoryId: string;
  amount: number;
  description: string;
  startDate: string;
  frequency: RecurrenceFrequency;
  endDate?: string | null;
  activeMemberIds: readonly string[];
  allowedCategoryIds: readonly string[];
};

export type CreateRecurringIncomePayload = {
  householdId: string;
  categoryId: string;
  amount: number;
  description: string;
  startDate: string;
  frequency: RecurrenceFrequency;
  endDate: string | null;
};

export function parseRecurrenceAmountInput(raw: string | null | undefined): number | null {
  return parseExpenseAmountInput(raw);
}

export function amountToRecurrenceInput(amount: number): string {
  return amountToExpenseInput(amount);
}

export function recurrenceAmountMessage(raw: string): string | null {
  return expenseAmountMessage(raw);
}

export function recurrenceIncomeDescriptionMessage(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return "Ingresa una descripción del ingreso.";
  return incomeDescriptionMessage(raw);
}

export function recurrenceStartDateMessage(raw: string): string | null {
  if (!raw.trim() || !isCalendarDate(raw.trim())) return "La fecha de inicio no es válida.";
  return null;
}

export function recurrenceEndDateMessage(endDate: string, startDate: string): string | null {
  const trimmed = endDate.trim();
  if (!trimmed) return null;
  if (!isCalendarDate(trimmed)) return "La fecha de fin no es válida.";
  if (isCalendarDate(startDate) && trimmed < startDate) {
    return "La fecha de fin no puede ser anterior al inicio.";
  }
  return null;
}

export function recurrenceFrequencyMessage(value: string | null | undefined): string | null {
  if (!isRecurrenceFrequency(value)) return "Elige una frecuencia.";
  return null;
}

function sharedDates(
  startDate: string,
  endDate: string | null | undefined,
): { ok: true; startDate: string; endDate: string | null } | { ok: false; error: NidoErrorCode } {
  if (!isCalendarDate(startDate)) return { ok: false, error: "invalid_date" };
  const trimmedEnd = endDate?.trim() ? endDate.trim() : null;
  if (trimmedEnd && !isCalendarDate(trimmedEnd)) return { ok: false, error: "invalid_date" };
  if (trimmedEnd && trimmedEnd < startDate) return { ok: false, error: "invalid_date" };
  return { ok: true, startDate, endDate: trimmedEnd };
}

export function buildCreateRecurringIncomePayload(
  input: CreateRecurringIncomeRequest,
  userId: string,
): { ok: true; data: CreateRecurringIncomePayload } | { ok: false; error: NidoErrorCode } {
  if (!input.householdId) return { ok: false, error: "not_a_member" };
  if (!userId) return { ok: false, error: "unauthenticated" };
  if (!input.activeMemberIds.includes(userId)) return { ok: false, error: "not_a_member" };

  const amount = roundMoney(input.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_MONEY_AMOUNT) {
    return { ok: false, error: "invalid_amount" };
  }

  const description = normalizeIncomeDescription(input.description);
  if (!description) return { ok: false, error: "invalid_description" };

  if (!isRecurrenceFrequency(input.frequency)) return { ok: false, error: "invalid_date" };

  const dates = sharedDates(input.startDate, input.endDate);
  if (dates.ok === false) return dates;

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
      startDate: dates.startDate,
      frequency: input.frequency,
      endDate: dates.endDate,
    },
  };
}
