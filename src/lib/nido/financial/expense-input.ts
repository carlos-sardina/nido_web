import type { NidoErrorCode } from "../types.ts";
import { isCalendarDate } from "./dates.ts";
import { MAX_MONEY_AMOUNT, parseMoney, roundMoney } from "./money.ts";
import { allocateEqualSplits, personalSplit, splitIssue, type SplitDraft } from "./splits.ts";
import type { ExpenseScope } from "./types.ts";

export const EXPENSE_DESCRIPTION_MAX = 80;
export const MAX_MONEY_DECIMALS = 2;

const INVALID_AMOUNT = "Ingresa un monto válido.";
const NEGATIVE_AMOUNT = "El monto no puede ser negativo.";
const TOO_LARGE_AMOUNT = "El monto es demasiado grande.";

export type CreateExpenseRequest = {
  householdId: string;
  categoryId: string;
  amount: number;
  description: string;
  occurredAt: string;
  scope: ExpenseScope;
  /**
   * Who paid. Defaults to the writer. Must be an active household member,
   * or ALL_MEMBERS_PAYER on a shared expense (everyone paid their share).
   */
  payerId?: string;
  participantIds: readonly string[];
  activeMemberIds: readonly string[];
  allowedCategoryIds: readonly string[];
};

export type CreateExpensePayload = {
  householdId: string;
  categoryId: string;
  amount: number;
  description: string | null;
  occurredAt: string;
  payerId: string | null;
  scope: ExpenseScope;
  splits: SplitDraft[];
};

/** Form sentinel: every participant paid their share; nobody owes anyone. */
export const ALL_MEMBERS_PAYER = "all";

export function isAllMembersPayer(payerId: string | null | undefined): boolean {
  return payerId === ALL_MEMBERS_PAYER;
}

/** Shared expenses with two members split between both; the picker is unnecessary. */
export function showExpenseParticipantPicker(
  scope: ExpenseScope | null,
  memberCount: number,
): boolean {
  return scope === "shared" && memberCount > 2;
}

/** Who paid only matters when the expense can be attributed to another member. */
export function showExpensePayerPicker(
  scope: ExpenseScope | null,
  memberCount: number,
): boolean {
  return scope === "shared" && memberCount >= 2;
}

export function resolveExpenseParticipantIds(
  scope: ExpenseScope,
  memberIds: readonly string[],
  selectedIds: readonly string[],
): readonly string[] {
  if (scope !== "shared") return selectedIds;
  if (memberIds.length <= 2) return memberIds;
  return selectedIds;
}

export function resolveExpensePayerId(
  scope: ExpenseScope,
  selectedPayerId: string,
  currentUserId: string,
  memberIds: readonly string[],
): string {
  const self = memberIds.includes(currentUserId)
    ? currentUserId
    : (memberIds[0] ?? currentUserId);
  if (scope === "personal") return self;
  if (isAllMembersPayer(selectedPayerId)) return ALL_MEMBERS_PAYER;
  if (memberIds.includes(selectedPayerId)) return selectedPayerId;
  return self;
}

function looksNegative(raw: string): boolean {
  return /^\s*-/.test(raw) || /-\s*\d/.test(raw);
}

function decimalPlacesOf(normalized: string): number {
  const dot = normalized.indexOf(".");
  return dot === -1 ? 0 : normalized.length - dot - 1;
}

/**
 * Parse a form amount without coercing invalid input to 0.
 * MoneyField already strips currency symbols; this still rejects
 * scientific notation, extra decimals, NaN, and Infinity.
 */
export function amountToExpenseInput(amount: number): string {
  const rounded = roundMoney(amount);
  if (!Number.isFinite(rounded)) return "";
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

export function parseExpenseAmountInput(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (looksNegative(trimmed)) return null;
  if (/[eE]|inf|nan/i.test(trimmed)) return null;
  if (!/^\d+(\.\d+)?$/.test(trimmed) && !/^\.\d+$/.test(trimmed)) return null;
  if (decimalPlacesOf(trimmed) > MAX_MONEY_DECIMALS) return null;

  const parsed = parseMoney(trimmed);
  if (parsed == null || parsed < 0) return null;
  return parsed;
}

export function expenseAmountMessage(raw: string): string | null {
  if (!raw.trim()) return INVALID_AMOUNT;
  if (looksNegative(raw)) return NEGATIVE_AMOUNT;
  const stripped = raw.trim();
  if (decimalPlacesOf(stripped) > MAX_MONEY_DECIMALS) return INVALID_AMOUNT;
  const value = parseExpenseAmountInput(raw);
  if (value === null) return INVALID_AMOUNT;
  if (value === 0) return INVALID_AMOUNT;
  if (value > MAX_MONEY_AMOUNT) return TOO_LARGE_AMOUNT;
  return null;
}

export function normalizeExpenseDescription(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return null;
  if (Array.from(trimmed).length > EXPENSE_DESCRIPTION_MAX) return null;
  return trimmed;
}

export function expenseDescriptionMessage(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (Array.from(trimmed).length > EXPENSE_DESCRIPTION_MAX) {
    return `La descripción debe tener ${EXPENSE_DESCRIPTION_MAX} caracteres o menos.`;
  }
  return null;
}

export function buildCreateExpensePayload(
  input: CreateExpenseRequest,
  writerId: string,
): { ok: true; data: CreateExpensePayload } | { ok: false; error: NidoErrorCode } {
  if (!input.householdId) return { ok: false, error: "not_a_member" };
  if (!writerId) return { ok: false, error: "unauthenticated" };
  if (!input.activeMemberIds.includes(writerId)) return { ok: false, error: "not_a_member" };

  const paidByAll = input.scope === "shared" && isAllMembersPayer(input.payerId);
  if (isAllMembersPayer(input.payerId) && input.scope !== "shared") {
    return { ok: false, error: "invalid_split" };
  }
  const payerId = paidByAll ? null : (input.payerId ?? writerId);
  if (payerId != null && !input.activeMemberIds.includes(payerId)) {
    return { ok: false, error: "not_a_member" };
  }

  const amount = roundMoney(input.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_MONEY_AMOUNT) {
    return { ok: false, error: "invalid_amount" };
  }

  const descriptionInput = input.description?.trim() ?? "";
  if (descriptionInput && Array.from(descriptionInput).length > EXPENSE_DESCRIPTION_MAX) {
    return { ok: false, error: "invalid_description" };
  }
  const description = normalizeExpenseDescription(input.description);

  if (!isCalendarDate(input.occurredAt)) return { ok: false, error: "invalid_date" };

  if (!input.categoryId || !input.allowedCategoryIds.includes(input.categoryId)) {
    return { ok: false, error: "invalid_category" };
  }

  if (input.scope !== "personal" && input.scope !== "shared") {
    return { ok: false, error: "invalid_split" };
  }

  const splits =
    input.scope === "personal"
      ? payerId
        ? personalSplit(payerId, amount)
        : null
      : allocateEqualSplits(amount, input.participantIds);

  if (!splits) return { ok: false, error: "invalid_split" };

  const issue = splitIssue({
    amount,
    scope: input.scope,
    payerId,
    splits,
    activeMemberIds: input.activeMemberIds,
  });
  if (issue) return { ok: false, error: issue };

  return {
    ok: true,
    data: {
      householdId: input.householdId,
      categoryId: input.categoryId,
      amount,
      description,
      occurredAt: input.occurredAt,
      payerId,
      scope: input.scope,
      splits,
    },
  };
}
