import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getMonthRange } from "./dates.ts";
import {
  canEditExpense,
  canMutateExpense,
  canRefundExpense,
  householdSpent,
  memberBalance,
  memberOwed,
  memberPaid,
  visiblePeriodExpenses,
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

  it("nets refunds of live expenses and ignores refunds of soft-deleted ones", () => {
    const rows = [
      expense({
        amount: 1000,
        payerId: "carlos",
        refunds: [
          {
            id: "r1",
            expenseId: "e1",
            amount: 200,
            occurredAt: "2026-09-01",
            createdBy: "carlos",
            createdAt: "2026-09-01T12:00:00.000Z",
            splits: [],
          },
        ],
      }),
      expense({
        id: "e2",
        amount: 800,
        payerId: "carlos",
        deletedAt: "2026-08-11T00:00:00.000Z",
        refunds: [
          {
            id: "r2",
            expenseId: "e2",
            amount: 800,
            occurredAt: "2026-08-12",
            createdBy: "carlos",
            createdAt: "2026-08-12T12:00:00.000Z",
            splits: [],
          },
        ],
      }),
    ];
    assert.equal(householdSpent(rows), 800);
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

  it("nets refunds from paid and from each member's owed share", () => {
    const splits = [
      split({ memberId: "carlos", amount: 600 }),
      split({ memberId: "diana", amount: 400 }),
    ];
    const rows = [
      expense({
        amount: 1000,
        payerId: "carlos",
        splits,
        refunds: [
          {
            id: "r1",
            expenseId: "e1",
            amount: 200,
            occurredAt: "2026-09-03",
            createdBy: "carlos",
            createdAt: "2026-09-03T12:00:00.000Z",
            splits: [
              { id: "rs-c", refundId: "r1", memberId: "carlos", amount: 120, percentage: 60 },
              { id: "rs-d", refundId: "r1", memberId: "diana", amount: 80, percentage: 40 },
            ],
          },
        ],
      }),
    ];
    assert.equal(memberPaid(rows, "carlos"), 800);
    assert.equal(memberBalance(rows, "carlos"), 320);
    assert.equal(memberBalance(rows, "diana"), -320);
  });
});

describe("expense authorization helper", () => {
  it("allows only the creator of a live expense", () => {
    const live = expense({ amount: 100, payerId: "carlos", createdBy: "carlos" });
    assert.equal(canMutateExpense(live, "carlos"), true);
    assert.equal(canMutateExpense(live, "diana"), false);
    assert.equal(canMutateExpense(live, null), false);
  });

  it("rejects a soft-deleted expense even for the creator", () => {
    const deleted = expense({
      amount: 100,
      payerId: "carlos",
      createdBy: "carlos",
      deletedAt: "2026-08-21T12:00:00.000Z",
    });
    assert.equal(canMutateExpense(deleted, "carlos"), false);
  });

  it("blocks edit when live refunds exist but still allows a remaining refund", () => {
    const refunded = expense({
      amount: 1000,
      payerId: "carlos",
      createdBy: "carlos",
      refunds: [
        {
          id: "r1",
          expenseId: "e1",
          amount: 300,
          occurredAt: "2026-08-22",
          createdBy: "carlos",
          createdAt: "2026-08-22T12:00:00.000Z",
          splits: [],
        },
      ],
    });
    assert.equal(canMutateExpense(refunded, "carlos"), true);
    assert.equal(canEditExpense(refunded, "carlos"), false);
    assert.equal(canRefundExpense(refunded, "carlos"), true);
    assert.equal(
      canRefundExpense({ ...refunded, refunds: [{ ...refunded.refunds![0], amount: 1000 }] }, "carlos"),
      false,
    );
  });
});

describe("visible period expenses", () => {
  const range = getMonthRange(2026, 8);

  it("excludes soft-deleted rows and another household", () => {
    const rows = [
      expense({
        id: "keep",
        amount: 80,
        payerId: "carlos",
        occurredAt: "2026-08-20",
        createdAt: "2026-08-20T10:00:00.000Z",
      }),
      expense({
        id: "deleted",
        amount: 200,
        payerId: "carlos",
        occurredAt: "2026-08-21",
        deletedAt: "2026-08-21T12:00:00.000Z",
      }),
      expense({
        id: "other",
        householdId: "h2",
        amount: 50,
        payerId: "luis",
        occurredAt: "2026-08-21",
      }),
      expense({
        id: "july",
        amount: 90,
        payerId: "carlos",
        occurredAt: "2026-07-31",
      }),
    ];
    const visible = visiblePeriodExpenses(rows, range, "h1");
    assert.deepEqual(visible.map((row) => row.id), ["keep"]);
  });

  it("sorts by date descending then created_at descending", () => {
    const rows = [
      expense({
        id: "older",
        amount: 10,
        payerId: "carlos",
        occurredAt: "2026-08-21",
        createdAt: "2026-08-21T10:00:00.000Z",
      }),
      expense({
        id: "newer",
        amount: 20,
        payerId: "carlos",
        occurredAt: "2026-08-21",
        createdAt: "2026-08-21T18:00:00.000Z",
      }),
      expense({
        id: "earlier-day",
        amount: 30,
        payerId: "carlos",
        occurredAt: "2026-08-10",
        createdAt: "2026-08-10T20:00:00.000Z",
      }),
    ];
    assert.deepEqual(
      visiblePeriodExpenses(rows, range, "h1").map((row) => row.id),
      ["newer", "older", "earlier-day"],
    );
  });
});

describe("personal expense split", () => {
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
