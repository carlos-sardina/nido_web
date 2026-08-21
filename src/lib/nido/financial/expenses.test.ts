import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  householdSpent,
  memberBalance,
  memberOwed,
  memberPaid,
} from "./expenses.ts";
import type { ExpenseRow, ExpenseSplitRow } from "./types.ts";

function split(partial: Partial<ExpenseSplitRow> & Pick<ExpenseSplitRow, "memberId" | "amount">): ExpenseSplitRow {
  return {
    id: partial.id ?? `s-${partial.memberId}`,
    expenseId: partial.expenseId ?? "e1",
    percentage: partial.percentage ?? null,
    ...partial,
  };
}

function expense(partial: Partial<ExpenseRow> & Pick<ExpenseRow, "amount" | "payerId">): ExpenseRow {
  return {
    id: partial.id ?? "e1",
    householdId: "h1",
    categoryId: "c1",
    description: null,
    occurredAt: "2026-08-10",
    scope: "shared",
    distributionMethod: "equal",
    recurringId: null,
    createdBy: "u1",
    createdAt: "2026-08-10T12:00:00.000Z",
    deletedAt: null,
    category: null,
    payer: null,
    splits: [],
    ...partial,
  };
}

describe("household spent", () => {
  it("sums confirmed expense totals, not split rows", () => {
    const rows = [
      expense({
        amount: 1000,
        payerId: "carlos",
        splits: [split({ memberId: "diana", amount: 500 }), split({ memberId: "luis", amount: 500 })],
      }),
    ];
    assert.equal(householdSpent(rows), 1000);
  });

  it("ignores soft-deleted expenses", () => {
    const rows = [
      expense({ amount: 200, payerId: "carlos" }),
      expense({ id: "e2", amount: 800, payerId: "carlos", deletedAt: "2026-08-11T00:00:00.000Z" }),
    ];
    assert.equal(householdSpent(rows), 200);
  });
});

describe("expense splits", () => {
  it("attributes a shared expense by splits, not by expenses.amount", () => {
    const splits = [
      split({ memberId: "diana", amount: 500 }),
      split({ memberId: "luis", amount: 500 }),
    ];
    const rows = [expense({ amount: 1000, payerId: "carlos", splits })];

    assert.equal(memberPaid(rows, "carlos"), 1000);
    assert.equal(memberOwed(splits, "carlos"), 0);
    assert.equal(memberOwed(splits, "diana"), 500);
    assert.equal(memberBalance(rows, "carlos"), 1000);
    assert.equal(memberBalance(rows, "diana"), -500);
  });

  it("handles a payer who also participates", () => {
    const splits = [
      split({ memberId: "carlos", amount: 500 }),
      split({ memberId: "diana", amount: 500 }),
    ];
    const rows = [expense({ amount: 1000, payerId: "carlos", splits })];
    assert.equal(memberBalance(rows, "carlos"), 500);
    assert.equal(memberBalance(rows, "diana"), -500);
  });

  it("treats a personal expense as a single full split", () => {
    const splits = [split({ memberId: "diana", amount: 240, percentage: 100 })];
    const rows = [
      expense({
        amount: 240,
        payerId: "diana",
        scope: "personal",
        splits,
      }),
    ];
    assert.equal(householdSpent(rows), 240);
    assert.equal(memberOwed(splits, "diana"), 240);
    assert.equal(memberBalance(rows, "diana"), 0);
  });
});
