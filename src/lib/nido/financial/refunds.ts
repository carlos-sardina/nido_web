import type { NidoErrorCode } from "../types.ts";
import { MAX_MONEY_AMOUNT, roundMoney, sumMoney } from "./money.ts";
import { allocateIncomeBasedSplits, type SplitDraft } from "./splits.ts";
import type { ExpenseRefundRow, ExpenseRow, ExpenseSplitRow } from "./types.ts";

export function expenseRefunds(
  expense: Pick<ExpenseRow, "refunds"> | null | undefined,
): ExpenseRefundRow[] {
  return expense?.refunds ?? [];
}

export function refundedTotal(
  refunds: ReadonlyArray<Pick<ExpenseRefundRow, "amount">> | null | undefined,
): number {
  return sumMoney((refunds ?? []).map((refund) => refund.amount));
}

/**
 * Amount still available to refund. Never negative.
 * Same number as `netExpense` when refunds cannot exceed the expense.
 */
export function refundableRemaining(
  expenseAmount: number,
  existingRefunds: ReadonlyArray<Pick<ExpenseRefundRow, "amount">> | null | undefined,
): number {
  const expense = roundMoney(expenseAmount);
  if (!Number.isFinite(expense) || expense <= 0) return 0;
  return Math.max(0, roundMoney(expense - refundedTotal(existingRefunds)));
}

export function netExpense(
  expenseAmount: number,
  refunds: ReadonlyArray<Pick<ExpenseRefundRow, "amount">> | null | undefined,
): number {
  return refundableRemaining(expenseAmount, refunds);
}

export function validateRefundAmount(
  amount: number,
  remaining: number,
): NidoErrorCode | null {
  const value = roundMoney(amount);
  const cap = roundMoney(remaining);
  if (!Number.isFinite(value) || value <= 0 || value > MAX_MONEY_AMOUNT) {
    return "invalid_amount";
  }
  if (!Number.isFinite(cap) || cap < 0) return "invalid_amount";
  if (value > cap) return "invalid_amount";
  return null;
}

/**
 * Distribute a refund using the original expense split amounts as weights.
 * Reuses `allocateIncomeBasedSplits` so rounding matches proportional
 * expenses: leftover cents go to the last participant.
 */
export function allocateRefundSplits(
  refundAmount: number,
  expenseSplits: ReadonlyArray<Pick<ExpenseSplitRow, "memberId" | "amount">>,
): SplitDraft[] | null {
  return allocateIncomeBasedSplits(
    refundAmount,
    expenseSplits.map((split) => ({ memberId: split.memberId, income: split.amount })),
  );
}

export function expenseHasRefunds(expense: Pick<ExpenseRow, "refunds">): boolean {
  return expenseRefunds(expense).length > 0;
}
