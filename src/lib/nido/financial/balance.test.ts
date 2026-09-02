import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyMonthlyBalancePayment,
  calculateMemberBalances,
  calculateMonthlyBalance,
  compactBalanceCopy,
  deriveSettlements,
  findOutstandingBalanceMonths,
} from "./balance.ts";
import { getMonthRange } from "./dates.ts";
import { allocateEqualSplits, allocateIncomeBasedSplits } from "./splits.ts";
import { allocateRefundSplits } from "./refunds.ts";
import type { ExpenseRefundRow, ExpenseRow, ExpenseSplitRow, IncomeRow } from "./types.ts";
import type { HouseholdMemberView } from "../types.ts";

const august = getMonthRange(2026, 8);
const july = getMonthRange(2026, 7);
const september = getMonthRange(2026, 9);

const members: HouseholdMemberView[] = [
  {
    userId: "carlos",
    role: "owner",
    joinedAt: "2026-01-01T00:00:00.000Z",
    displayName: "Carlos Sardina",
    avatarUrl: null,
  },
  {
    userId: "diana",
    role: "member",
    joinedAt: "2026-01-02T00:00:00.000Z",
    displayName: "Diana Vega",
    avatarUrl: null,
  },
];

const trio: HouseholdMemberView[] = [
  ...members,
  {
    userId: "luis",
    role: "member",
    joinedAt: "2026-01-03T00:00:00.000Z",
    displayName: "Luis Pérez",
    avatarUrl: null,
  },
];

function split(
  partial: Partial<ExpenseSplitRow> & Pick<ExpenseSplitRow, "memberId" | "amount">,
): ExpenseSplitRow {
  return {
    id: partial.id ?? `s-${partial.memberId}`,
    expenseId: partial.expenseId ?? "e1",
    percentage: partial.percentage ?? null,
    ...partial,
  };
}

function refund(partial: Partial<ExpenseRefundRow> & Pick<ExpenseRefundRow, "amount">): ExpenseRefundRow {
  return {
    id: partial.id ?? "r1",
    expenseId: partial.expenseId ?? "e1",
    occurredAt: partial.occurredAt ?? "2026-08-20",
    createdBy: partial.createdBy ?? "carlos",
    createdAt: partial.createdAt ?? "2026-08-20T12:00:00.000Z",
    splits: partial.splits ?? [],
    amount: partial.amount,
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
    createdBy: partial.createdBy ?? partial.payerId ?? "u1",
    createdAt: "2026-08-10T12:00:00.000Z",
    deletedAt: null,
    category: null,
    payer: null,
    splits: [],
    ...partial,
  };
}

function income(
  partial: Partial<IncomeRow> & Pick<IncomeRow, "amount" | "memberId">,
): IncomeRow {
  return {
    id: partial.id ?? `i-${partial.memberId}`,
    householdId: "h1",
    categoryId: "inc",
    description: null,
    occurredAt: "2026-08-01",
    recurringId: null,
    createdBy: partial.memberId,
    createdAt: "2026-08-01T12:00:00.000Z",
    deletedAt: null,
    category: null,
    member: null,
    ...partial,
  };
}

function equalExpense(
  amount: number,
  payerId: string,
  memberIds: string[],
  extra: Partial<ExpenseRow> = {},
): ExpenseRow {
  const drafts = allocateEqualSplits(amount, memberIds);
  assert.ok(drafts);
  return expense({
    amount,
    payerId,
    distributionMethod: "equal",
    splits: drafts.map((draft) => split(draft)),
    ...extra,
  });
}

function balancesClose(members: { balance: number }[]): void {
  const positive = members.filter((row) => row.balance > 0).reduce((sum, row) => sum + row.balance, 0);
  const negative = members.filter((row) => row.balance < 0).reduce((sum, row) => sum + row.balance, 0);
  assert.equal(Math.round(positive * 100), Math.round(Math.abs(negative) * 100));
}

describe("calculateMonthlyBalance — 50/50 and payer", () => {
  it("splits a shared expense 50/50 paid by A", () => {
    const result = calculateMonthlyBalance({
      expenses: [equalExpense(1000, "carlos", ["carlos", "diana"])],
      incomes: [],
      members,
      range: august,
      householdId: "h1",
    });
    const carlos = result.members.find((row) => row.memberId === "carlos");
    const diana = result.members.find((row) => row.memberId === "diana");
    assert.equal(carlos?.paid, 1000);
    assert.equal(carlos?.owed, 500);
    assert.equal(carlos?.balance, 500);
    assert.equal(diana?.paid, 0);
    assert.equal(diana?.owed, 500);
    assert.equal(diana?.balance, -500);
    assert.deepEqual(result.settlements, [
      {
        fromMemberId: "diana",
        fromName: "Diana",
        toMemberId: "carlos",
        toName: "Carlos",
        amount: 500,
      },
    ]);
    assert.equal(result.status, "unsettled");
    assert.equal(result.sharedGross, 1000);
    assert.equal(result.sharedNet, 1000);
    balancesClose(result.members);
  });

  it("splits a shared expense 50/50 paid by B", () => {
    const result = calculateMonthlyBalance({
      expenses: [equalExpense(1000, "diana", ["carlos", "diana"])],
      incomes: [],
      members,
      range: august,
      householdId: "h1",
    });
    assert.equal(result.members.find((row) => row.memberId === "diana")?.balance, 500);
    assert.equal(result.members.find((row) => row.memberId === "carlos")?.balance, -500);
    assert.equal(result.settlements[0]?.fromMemberId, "carlos");
    assert.equal(result.settlements[0]?.toMemberId, "diana");
    assert.equal(result.settlements[0]?.amount, 500);
  });

  it("does not create a debt when everyone paid their share", () => {
    const result = calculateMonthlyBalance({
      expenses: [equalExpense(1000, "carlos", ["carlos", "diana"], { payerId: null })],
      incomes: [],
      members,
      range: august,
      householdId: "h1",
    });
    const carlos = result.members.find((row) => row.memberId === "carlos");
    const diana = result.members.find((row) => row.memberId === "diana");
    assert.equal(carlos?.paid, 500);
    assert.equal(carlos?.owed, 500);
    assert.equal(carlos?.balance, 0);
    assert.equal(diana?.paid, 500);
    assert.equal(diana?.owed, 500);
    assert.equal(diana?.balance, 0);
    assert.equal(result.settlements.length, 0);
    assert.equal(result.status, "settled");
    assert.equal(result.sharedGross, 1000);
    balancesClose(result.members);
  });
});

describe("calculateMonthlyBalance — multiple expenses and members", () => {
  it("nets multiple shared expenses", () => {
    const result = calculateMonthlyBalance({
      expenses: [
        equalExpense(1000, "carlos", ["carlos", "diana"], { id: "e1" }),
        equalExpense(400, "diana", ["carlos", "diana"], { id: "e2" }),
      ],
      incomes: [],
      members,
      range: august,
      householdId: "h1",
    });
    assert.equal(result.members.find((row) => row.memberId === "carlos")?.paid, 1000);
    assert.equal(result.members.find((row) => row.memberId === "diana")?.paid, 400);
    assert.equal(result.members.find((row) => row.memberId === "carlos")?.owed, 700);
    assert.equal(result.members.find((row) => row.memberId === "diana")?.owed, 700);
    assert.equal(result.members.find((row) => row.memberId === "carlos")?.balance, 300);
    assert.equal(result.members.find((row) => row.memberId === "diana")?.balance, -300);
    assert.equal(result.settlements[0]?.amount, 300);
    balancesClose(result.members);
  });

  it("handles three members with unequal shares", () => {
    const result = calculateMonthlyBalance({
      expenses: [
        expense({
          amount: 1000,
          payerId: "carlos",
          distributionMethod: "fixed",
          splits: [
            split({ memberId: "carlos", amount: 400, percentage: 40 }),
            split({ memberId: "diana", amount: 350, percentage: 35 }),
            split({ memberId: "luis", amount: 250, percentage: 25 }),
          ],
        }),
      ],
      incomes: [],
      members: trio,
      range: august,
      householdId: "h1",
    });
    assert.equal(result.members.find((row) => row.memberId === "carlos")?.balance, 600);
    assert.equal(result.members.find((row) => row.memberId === "diana")?.balance, -350);
    assert.equal(result.members.find((row) => row.memberId === "luis")?.balance, -250);
    assert.deepEqual(
      result.settlements.map((row) => [row.fromMemberId, row.toMemberId, row.amount]),
      [
        ["diana", "carlos", 350],
        ["luis", "carlos", 250],
      ],
    );
    balancesClose(result.members);
  });
});

describe("calculateMonthlyBalance — split methods", () => {
  it("uses stored amounts for a proportional / income_based split", () => {
    const drafts = allocateIncomeBasedSplits(1000, [
      { memberId: "carlos", income: 30000 },
      { memberId: "diana", income: 20000 },
    ]);
    assert.ok(drafts);
    const result = calculateMonthlyBalance({
      expenses: [
        expense({
          amount: 1000,
          payerId: "carlos",
          distributionMethod: "income_based",
          splits: drafts.map((draft) => split(draft)),
        }),
      ],
      incomes: [],
      members,
      range: august,
      householdId: "h1",
    });
    const carlos = result.members.find((row) => row.memberId === "carlos");
    const diana = result.members.find((row) => row.memberId === "diana");
    assert.equal(carlos?.owed, 600);
    assert.equal(diana?.owed, 400);
    assert.equal(carlos?.balance, 400);
    assert.equal(diana?.balance, -400);
  });

  it("uses stored amounts for a fixed split", () => {
    const result = calculateMonthlyBalance({
      expenses: [
        expense({
          amount: 1000,
          payerId: "carlos",
          distributionMethod: "fixed",
          splits: [
            split({ memberId: "carlos", amount: 600, percentage: 60 }),
            split({ memberId: "diana", amount: 400, percentage: 40 }),
          ],
        }),
      ],
      incomes: [],
      members,
      range: august,
      householdId: "h1",
    });
    assert.equal(result.members.find((row) => row.memberId === "carlos")?.balance, 400);
    assert.equal(result.members.find((row) => row.memberId === "diana")?.balance, -400);
  });
});

describe("calculateMonthlyBalance — personal vs shared", () => {
  it("ignores a personal expense even when it is visible to the Nido", () => {
    const result = calculateMonthlyBalance({
      expenses: [
        expense({
          id: "personal",
          amount: 200,
          payerId: "carlos",
          scope: "personal",
          distributionMethod: "fixed",
          splits: [split({ memberId: "carlos", amount: 200, percentage: 100 })],
        }),
        equalExpense(1000, "carlos", ["carlos", "diana"]),
      ],
      incomes: [],
      members,
      range: august,
      householdId: "h1",
    });
    assert.equal(result.sharedGross, 1000);
    assert.equal(result.members.find((row) => row.memberId === "carlos")?.paid, 1000);
    assert.equal(result.settlements[0]?.amount, 500);
  });

  it("treats only-personal period as empty, not as a $0 debt", () => {
    const result = calculateMonthlyBalance({
      expenses: [
        expense({
          amount: 200,
          payerId: "carlos",
          scope: "personal",
          distributionMethod: "fixed",
          splits: [split({ memberId: "carlos", amount: 200, percentage: 100 })],
        }),
      ],
      incomes: [],
      members,
      range: august,
      householdId: "h1",
    });
    assert.equal(result.status, "empty");
    assert.deepEqual(result.settlements, []);
    assert.equal(result.sharedGross, 0);
  });
});

describe("calculateMonthlyBalance — refunds", () => {
  it("applies a partial refund to paid, owed, and settlements", () => {
    const expenseSplits = [
      split({ memberId: "carlos", amount: 600, percentage: 60 }),
      split({ memberId: "diana", amount: 400, percentage: 40 }),
    ];
    const refundDrafts = allocateRefundSplits(200, expenseSplits);
    assert.ok(refundDrafts);
    const result = calculateMonthlyBalance({
      expenses: [
        expense({
          amount: 1000,
          payerId: "carlos",
          splits: expenseSplits,
          refunds: [refund({ amount: 200, splits: refundDrafts.map((draft) => ({
            id: `rs-${draft.memberId}`,
            refundId: "r1",
            memberId: draft.memberId,
            amount: draft.amount,
            percentage: draft.percentage,
          })) })],
        }),
      ],
      incomes: [],
      members,
      range: august,
      householdId: "h1",
    });
    const carlos = result.members.find((row) => row.memberId === "carlos");
    const diana = result.members.find((row) => row.memberId === "diana");
    assert.equal(result.sharedGross, 1000);
    assert.equal(result.sharedNet, 800);
    assert.equal(carlos?.paid, 800);
    assert.equal(carlos?.owed, 480);
    assert.equal(carlos?.balance, 320);
    assert.equal(diana?.paid, 0);
    assert.equal(diana?.owed, 320);
    assert.equal(diana?.balance, -320);
    assert.equal(result.settlements[0]?.amount, 320);
    balancesClose(result.members);
  });

  it("a full refund leaves the period settled", () => {
    const expenseSplits = [
      split({ memberId: "carlos", amount: 500, percentage: 50 }),
      split({ memberId: "diana", amount: 500, percentage: 50 }),
    ];
    const refundDrafts = allocateRefundSplits(1000, expenseSplits);
    assert.ok(refundDrafts);
    const result = calculateMonthlyBalance({
      expenses: [
        expense({
          amount: 1000,
          payerId: "carlos",
          splits: expenseSplits,
          refunds: [refund({ amount: 1000, splits: refundDrafts.map((draft) => ({
            id: `rs-${draft.memberId}`,
            refundId: "r1",
            memberId: draft.memberId,
            amount: draft.amount,
            percentage: draft.percentage,
          })) })],
        }),
      ],
      incomes: [],
      members,
      range: august,
      householdId: "h1",
    });
    assert.equal(result.sharedNet, 0);
    assert.equal(result.members.find((row) => row.memberId === "carlos")?.balance, 0);
    assert.equal(result.members.find((row) => row.memberId === "diana")?.balance, 0);
    assert.equal(result.status, "settled");
    assert.deepEqual(result.settlements, []);
  });

  it("attributes a later-month refund to the original expense month", () => {
    const expenseSplits = [
      split({ memberId: "carlos", amount: 600, percentage: 60 }),
      split({ memberId: "diana", amount: 400, percentage: 40 }),
    ];
    const refundDrafts = allocateRefundSplits(200, expenseSplits);
    assert.ok(refundDrafts);
    const row = expense({
      amount: 1000,
      payerId: "carlos",
      occurredAt: "2026-08-25",
      splits: expenseSplits,
      refunds: [
        refund({
          amount: 200,
          occurredAt: "2026-09-03",
          createdAt: "2026-09-03T12:00:00.000Z",
          splits: refundDrafts.map((draft) => ({
            id: `rs-${draft.memberId}`,
            refundId: "r1",
            memberId: draft.memberId,
            amount: draft.amount,
            percentage: draft.percentage,
          })),
        }),
      ],
    });

    const augustBalance = calculateMonthlyBalance({
      expenses: [row],
      incomes: [],
      members,
      range: august,
      householdId: "h1",
    });
    const septemberBalance = calculateMonthlyBalance({
      expenses: [row],
      incomes: [],
      members,
      range: september,
      householdId: "h1",
    });

    assert.equal(augustBalance.status, "unsettled");
    assert.equal(augustBalance.sharedNet, 800);
    assert.equal(augustBalance.settlements[0]?.amount, 320);
    assert.equal(septemberBalance.status, "empty");
    assert.equal(septemberBalance.sharedNet, 0);
    assert.deepEqual(septemberBalance.settlements, []);
  });
});

describe("calculateMonthlyBalance — soft-delete, empty, incomes", () => {
  it("ignores a soft-deleted expense and its refunds", () => {
    const result = calculateMonthlyBalance({
      expenses: [
        expense({
          amount: 1000,
          payerId: "carlos",
          deletedAt: "2026-08-12T00:00:00.000Z",
          splits: [
            split({ memberId: "carlos", amount: 500, percentage: 50 }),
            split({ memberId: "diana", amount: 500, percentage: 50 }),
          ],
          refunds: [
            refund({
              amount: 200,
              splits: [
                { id: "rs-c", refundId: "r1", memberId: "carlos", amount: 100, percentage: 50 },
                { id: "rs-d", refundId: "r1", memberId: "diana", amount: 100, percentage: 50 },
              ],
            }),
          ],
        }),
      ],
      incomes: [],
      members,
      range: august,
      householdId: "h1",
    });
    assert.equal(result.status, "empty");
    assert.equal(result.sharedNet, 0);
    assert.deepEqual(result.settlements, []);
  });

  it("lists a member without movements at zero", () => {
    const result = calculateMonthlyBalance({
      expenses: [equalExpense(1000, "carlos", ["carlos", "diana"])],
      incomes: [],
      members: trio,
      range: august,
      householdId: "h1",
    });
    const luis = result.members.find((row) => row.memberId === "luis");
    assert.equal(luis?.paid, 0);
    assert.equal(luis?.owed, 0);
    assert.equal(luis?.balance, 0);
  });

  it("marks exact-zero shared balances as settled", () => {
    const result = calculateMonthlyBalance({
      expenses: [
        equalExpense(1000, "carlos", ["carlos", "diana"], { id: "e1" }),
        equalExpense(1000, "diana", ["carlos", "diana"], { id: "e2" }),
      ],
      incomes: [],
      members,
      range: august,
      householdId: "h1",
    });
    assert.equal(result.status, "settled");
    assert.deepEqual(result.settlements, []);
    assert.equal(result.members.find((row) => row.memberId === "carlos")?.balance, 0);
  });

  it("distinguishes no movements from incomes without shared expenses", () => {
    const empty = calculateMonthlyBalance({
      expenses: [],
      incomes: [],
      members,
      range: august,
      householdId: "h1",
    });
    const incomesOnly = calculateMonthlyBalance({
      expenses: [],
      incomes: [
        income({ amount: 30000, memberId: "carlos" }),
        income({ amount: 20000, memberId: "diana", id: "i-diana" }),
      ],
      members,
      range: august,
      householdId: "h1",
    });
    assert.equal(empty.status, "empty");
    assert.equal(empty.incomeTotal, 0);
    assert.deepEqual(empty.settlements, []);
    assert.equal(incomesOnly.status, "empty");
    assert.equal(incomesOnly.incomeTotal, 50000);
    assert.deepEqual(
      incomesOnly.memberIncomes.map((row) => [row.memberId, row.amount]),
      [
        ["carlos", 30000],
        ["diana", 20000],
      ],
    );
    assert.deepEqual(incomesOnly.settlements, []);
  });

  it("allows shared expenses without incomes", () => {
    const result = calculateMonthlyBalance({
      expenses: [equalExpense(18000, "carlos", ["carlos", "diana"])],
      incomes: [],
      members,
      range: august,
      householdId: "h1",
    });
    assert.equal(result.incomeTotal, 0);
    assert.equal(result.status, "unsettled");
    assert.equal(result.sharedGross, 18000);
  });
});

describe("calculateMonthlyBalance — period and visibility", () => {
  it("computes a previous month independently", () => {
    const result = calculateMonthlyBalance({
      expenses: [
        equalExpense(800, "diana", ["carlos", "diana"], {
          id: "july",
          occurredAt: "2026-07-15",
          createdAt: "2026-07-15T12:00:00.000Z",
        }),
        equalExpense(200, "carlos", ["carlos", "diana"], { id: "august" }),
      ],
      incomes: [income({ amount: 10000, memberId: "carlos", occurredAt: "2026-07-01" })],
      members,
      range: july,
      householdId: "h1",
    });
    assert.equal(result.sharedGross, 800);
    assert.equal(result.incomeTotal, 10000);
    assert.equal(result.settlements[0]?.fromMemberId, "carlos");
    assert.equal(result.settlements[0]?.amount, 400);
  });

  it("includes the last day of the month and excludes the next month", () => {
    const endOfMonth = equalExpense(100, "carlos", ["carlos", "diana"], {
      id: "aug-31",
      occurredAt: "2026-08-31",
    });
    const nextMonth = equalExpense(900, "diana", ["carlos", "diana"], {
      id: "sep-01",
      occurredAt: "2026-09-01",
      createdAt: "2026-09-01T12:00:00.000Z",
    });
    const augustBalance = calculateMonthlyBalance({
      expenses: [endOfMonth, nextMonth],
      incomes: [],
      members,
      range: august,
      householdId: "h1",
    });
    const septemberBalance = calculateMonthlyBalance({
      expenses: [endOfMonth, nextMonth],
      incomes: [],
      members,
      range: september,
      householdId: "h1",
    });
    assert.equal(augustBalance.sharedGross, 100);
    assert.equal(septemberBalance.sharedGross, 900);
  });

  it("does not invent private personal rows that are absent from the snapshot", () => {
    const result = calculateMonthlyBalance({
      expenses: [equalExpense(1000, "carlos", ["carlos", "diana"])],
      incomes: [],
      members,
      range: august,
      householdId: "h1",
    });
    assert.equal(result.sharedGross, 1000);
    assert.equal(result.members.find((row) => row.memberId === "carlos")?.paid, 1000);
  });
});

describe("deriveSettlements", () => {
  it("pays multiple debtors to one creditor", () => {
    const settlements = deriveSettlements([
      { memberId: "carlos", displayName: "Carlos", balance: 500 },
      { memberId: "diana", displayName: "Diana", balance: -300 },
      { memberId: "luis", displayName: "Luis", balance: -200 },
    ]);
    assert.deepEqual(
      settlements.map((row) => [row.fromMemberId, row.toMemberId, row.amount]),
      [
        ["diana", "carlos", 300],
        ["luis", "carlos", 200],
      ],
    );
  });

  it("pays one debtor to multiple creditors", () => {
    const settlements = deriveSettlements([
      { memberId: "carlos", displayName: "Carlos", balance: 300 },
      { memberId: "diana", displayName: "Diana", balance: 200 },
      { memberId: "luis", displayName: "Luis", balance: -500 },
    ]);
    const total = settlements.reduce((sum, row) => sum + row.amount, 0);
    assert.equal(total, 500);
    assert.equal(settlements.length, 2);
    assert.ok(settlements.every((row) => row.fromMemberId === "luis"));
  });

  it("settles several debtors and creditors without creating money", () => {
    const members = [
      { memberId: "a", displayName: "A", balance: 500 },
      { memberId: "b", displayName: "B", balance: 100 },
      { memberId: "c", displayName: "C", balance: -400 },
      { memberId: "d", displayName: "D", balance: -200 },
    ];
    const settlements = deriveSettlements(members);
    const paid = settlements.reduce((sum, row) => sum + row.amount, 0);
    assert.equal(paid, 600);
    balancesClose(members);
    assert.equal(settlements.length <= 3, true);
  });

  it("is deterministic when amounts tie", () => {
    const first = deriveSettlements([
      { memberId: "carlos", displayName: "Carlos", balance: 100 },
      { memberId: "diana", displayName: "Diana", balance: 100 },
      { memberId: "luis", displayName: "Luis", balance: -200 },
    ]);
    const second = deriveSettlements([
      { memberId: "luis", displayName: "Luis", balance: -200 },
      { memberId: "diana", displayName: "Diana", balance: 100 },
      { memberId: "carlos", displayName: "Carlos", balance: 100 },
    ]);
    assert.deepEqual(first, second);
  });

  it("keeps cent balances exact", () => {
    const members = calculateMemberBalances({
      expenses: [
        expense({
          amount: 10.01,
          payerId: "carlos",
          splits: [
            split({ memberId: "carlos", amount: 3.34, percentage: 33.37 }),
            split({ memberId: "diana", amount: 3.33, percentage: 33.27 }),
            split({ memberId: "luis", amount: 3.34, percentage: 33.36 }),
          ],
        }),
      ],
      members: trio,
    });
    const settlements = deriveSettlements(members);
    const paid = settlements.reduce((sum, row) => sum + row.amount, 0);
    const positive = members.filter((row) => row.balance > 0).reduce((sum, row) => sum + row.balance, 0);
    assert.equal(Math.round(paid * 100), Math.round(positive * 100));
    balancesClose(members);
  });
});

describe("compactBalanceCopy", () => {
  const unsettled = calculateMonthlyBalance({
    expenses: [equalExpense(1000, "carlos", ["carlos", "diana"])],
    incomes: [],
    members,
    range: august,
    householdId: "h1",
  });

  it("does not present an empty period as a $0 debt", () => {
    const empty = calculateMonthlyBalance({
      expenses: [],
      incomes: [],
      members,
      range: august,
      householdId: "h1",
    });
    assert.deepEqual(compactBalanceCopy(empty, "carlos"), {
      headline: "Sin gastos compartidos este mes",
      hasObligation: false,
    });
  });

  it("says the period is balanced when movements cancel", () => {
    const settled = calculateMonthlyBalance({
      expenses: [
        equalExpense(1000, "carlos", ["carlos", "diana"], { id: "e1" }),
        equalExpense(1000, "diana", ["carlos", "diana"], { id: "e2" }),
      ],
      incomes: [],
      members,
      range: august,
      householdId: "h1",
    });
    assert.deepEqual(compactBalanceCopy(settled, "carlos"), {
      headline: "Todo está equilibrado",
      hasObligation: false,
    });
  });

  it("phrases a single settlement for the current member", () => {
    assert.equal(compactBalanceCopy(unsettled, "carlos").headline, "Diana te debe $500");
    assert.equal(compactBalanceCopy(unsettled, "diana").headline, "Le debes $500 a Carlos");
  });

  it("says the debt was paid after unanimous confirmation", () => {
    const paid = applyMonthlyBalancePayment(unsettled, {
      confirmations: [
        {
          householdId: "h1",
          year: 2026,
          month: 8,
          userId: "carlos",
          confirmedAt: "2026-08-31T12:00:00.000Z",
        },
        {
          householdId: "h1",
          year: 2026,
          month: 8,
          userId: "diana",
          confirmedAt: "2026-08-31T12:05:00.000Z",
        },
      ],
      memberIds: ["carlos", "diana"],
    });
    assert.equal(paid.status, "paid");
    assert.deepEqual(compactBalanceCopy(paid, "carlos"), {
      headline: "Deuda pagada",
      hasObligation: false,
    });
  });
});

describe("applyMonthlyBalancePayment", () => {
  const unsettled = calculateMonthlyBalance({
    expenses: [equalExpense(1000, "carlos", ["carlos", "diana"])],
    incomes: [],
    members,
    range: august,
    householdId: "h1",
  });

  it("keeps the derived debt until every current member confirms", () => {
    const partial = applyMonthlyBalancePayment(unsettled, {
      confirmations: [
        {
          householdId: "h1",
          year: 2026,
          month: 8,
          userId: "carlos",
          confirmedAt: "2026-08-31T12:00:00.000Z",
        },
      ],
      memberIds: ["carlos", "diana"],
    });
    assert.equal(partial.status, "unsettled");
    assert.equal(partial.settlements[0]?.amount, 500);
    assert.deepEqual(partial.payment?.confirmedUserIds, ["carlos"]);
    assert.deepEqual(partial.payment?.pendingUserIds, ["diana"]);
  });

  it("zeros displayed balances when every member confirmed the same month", () => {
    const paid = applyMonthlyBalancePayment(unsettled, {
      confirmations: [
        {
          householdId: "h1",
          year: 2026,
          month: 8,
          userId: "carlos",
          confirmedAt: "2026-08-31T12:00:00.000Z",
        },
        {
          householdId: "h1",
          year: 2026,
          month: 8,
          userId: "diana",
          confirmedAt: "2026-08-31T12:05:00.000Z",
        },
      ],
      memberIds: ["carlos", "diana"],
    });
    assert.equal(paid.status, "paid");
    assert.deepEqual(paid.settlements, []);
    assert.equal(paid.members.every((row) => row.balance === 0), true);
    assert.equal(paid.members.find((row) => row.memberId === "carlos")?.paid, 1000);
  });

  it("ignores confirmations for another month", () => {
    const next = applyMonthlyBalancePayment(unsettled, {
      confirmations: [
        {
          householdId: "h1",
          year: 2026,
          month: 7,
          userId: "carlos",
          confirmedAt: "2026-07-31T12:00:00.000Z",
        },
        {
          householdId: "h1",
          year: 2026,
          month: 7,
          userId: "diana",
          confirmedAt: "2026-07-31T12:05:00.000Z",
        },
      ],
      memberIds: ["carlos", "diana"],
    });
    assert.equal(next.status, "unsettled");
  });
});

describe("findOutstandingBalanceMonths", () => {
  it("lists unpaid months newest first and skips paid or settled ones", () => {
    const rows = findOutstandingBalanceMonths({
      expenses: [
        equalExpense(1000, "carlos", ["carlos", "diana"], {
          id: "e-aug",
          occurredAt: "2026-08-10",
        }),
        equalExpense(400, "diana", ["carlos", "diana"], {
          id: "e-jul",
          occurredAt: "2026-07-08",
        }),
        equalExpense(1000, "carlos", ["carlos", "diana"], {
          id: "e-jun-a",
          occurredAt: "2026-06-04",
        }),
        equalExpense(1000, "diana", ["carlos", "diana"], {
          id: "e-jun-b",
          occurredAt: "2026-06-18",
        }),
      ],
      members,
      confirmations: [
        {
          householdId: "h1",
          year: 2026,
          month: 7,
          userId: "carlos",
          confirmedAt: "2026-07-31T12:00:00.000Z",
        },
        {
          householdId: "h1",
          year: 2026,
          month: 7,
          userId: "diana",
          confirmedAt: "2026-07-31T12:05:00.000Z",
        },
      ],
      through: august,
      householdId: "h1",
    });

    assert.deepEqual(
      rows.map((row) => `${row.range.year}-${row.range.month}`),
      ["2026-8"],
    );
    assert.equal(rows[0]?.status, "unsettled");
  });

  it("does not include months outside the lookback window", () => {
    const rows = findOutstandingBalanceMonths({
      expenses: [
        equalExpense(1000, "carlos", ["carlos", "diana"], {
          id: "e-old",
          occurredAt: "2024-01-10",
        }),
      ],
      members,
      confirmations: [],
      through: august,
      householdId: "h1",
      lookbackMonths: 6,
    });
    assert.deepEqual(rows, []);
  });
});
