import type { NidoErrorCode } from "../types.ts";
import { MAX_MONEY_AMOUNT, roundMoney, sumMoney } from "./money.ts";
import type { ExpenseScope } from "./types.ts";

export type SplitDraft = {
  memberId: string;
  amount: number;
  percentage: number;
};

function uniqueMemberIds(memberIds: readonly string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const id of memberIds) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    unique.push(id);
  }
  return unique;
}

/**
 * Equal allocation in cents so SUM(amount) equals the expense exactly.
 * Remainder cents go to the first participants. Percentages sum to 100.
 */
export function allocateEqualSplits(
  total: number,
  memberIds: readonly string[],
): SplitDraft[] | null {
  const amount = roundMoney(total);
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_MONEY_AMOUNT) return null;

  const unique = uniqueMemberIds(memberIds);
  if (unique.length === 0) return null;

  const totalCents = Math.round(amount * 100);
  const base = Math.floor(totalCents / unique.length);
  let remainder = totalCents - base * unique.length;

  const amounts = unique.map(() => {
    const extra = remainder > 0 ? 1 : 0;
    if (remainder > 0) remainder -= 1;
    return (base + extra) / 100;
  });

  const drafts: SplitDraft[] = unique.map((memberId, index) => ({
    memberId,
    amount: amounts[index],
    percentage: 0,
  }));

  let assigned = 0;
  for (let index = 0; index < drafts.length; index += 1) {
    if (index === drafts.length - 1) {
      drafts[index].percentage = roundMoney(100 - assigned);
    } else {
      const percent = roundMoney((drafts[index].amount * 100) / amount);
      drafts[index].percentage = percent;
      assigned = roundMoney(assigned + percent);
    }
  }

  return drafts;
}

export function personalSplit(payerId: string, amount: number): SplitDraft[] | null {
  const value = roundMoney(amount);
  if (!payerId || !Number.isFinite(value) || value <= 0 || value > MAX_MONEY_AMOUNT) {
    return null;
  }
  return [{ memberId: payerId, amount: value, percentage: 100 }];
}

export function splitIssue(input: {
  amount: number;
  scope: ExpenseScope;
  payerId: string;
  splits: readonly SplitDraft[];
  activeMemberIds: readonly string[];
}): NidoErrorCode | null {
  const amount = roundMoney(input.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_MONEY_AMOUNT) {
    return "invalid_amount";
  }
  if (!input.payerId) return "invalid_split";

  const active = new Set(input.activeMemberIds);
  if (!active.has(input.payerId)) return "invalid_split";

  const seen = new Set<string>();
  for (const split of input.splits) {
    if (!split.memberId || seen.has(split.memberId)) return "invalid_split";
    seen.add(split.memberId);
    if (!active.has(split.memberId)) return "invalid_split";
    if (!Number.isFinite(split.amount) || split.amount <= 0) return "invalid_split";
    if (split.percentage < 0 || split.percentage > 100) return "invalid_split";
  }

  if (roundMoney(sumMoney(input.splits.map((split) => split.amount))) !== amount) {
    return "invalid_split";
  }

  const percentTotal = roundMoney(sumMoney(input.splits.map((split) => split.percentage)));
  if (percentTotal !== 100) return "invalid_split";

  if (input.scope === "personal") {
    if (input.splits.length !== 1) return "invalid_split";
    if (input.splits[0].memberId !== input.payerId) return "invalid_split";
    return null;
  }

  if (input.splits.length < 2) return "invalid_split";
  return null;
}
