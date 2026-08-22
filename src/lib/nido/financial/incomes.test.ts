import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getMonthRange } from "./dates.ts";
import {
  activeRecurringIncomeBasis,
  canMutateIncome,
  isConfirmedFromRecurring,
  isOneTimeIncome,
  memberPeriodIncomeTotal,
  periodIncomeTotal,
  visiblePeriodIncomes,
} from "./incomes.ts";
import type { IncomeRow, RecurringIncomeRow } from "./types.ts";

function income(partial: Partial<IncomeRow> & Pick<IncomeRow, "amount">): IncomeRow {
  return {
    id: partial.id ?? "i1",
    householdId: "h1",
    memberId: "u1",
    categoryId: "c1",
    description: null,
    occurredAt: "2026-08-05",
    recurringId: null,
    createdBy: "u1",
    createdAt: "2026-08-05T12:00:00.000Z",
    deletedAt: null,
    category: null,
    member: null,
    ...partial,
  };
}

function rule(partial: Partial<RecurringIncomeRow> & Pick<RecurringIncomeRow, "amount">): RecurringIncomeRow {
  return {
    id: partial.id ?? "r1",
    householdId: "h1",
    memberId: "u1",
    description: "Sueldo",
    isActive: true,
    frequency: "monthly",
    endDate: null,
    ...partial,
  };
}

describe("period income", () => {
  it("sums confirmed incomes only", () => {
    const rows = [
      income({ amount: 40000, recurringId: "r1" }),
      income({ id: "i2", amount: 2500, recurringId: null }),
    ];
    assert.equal(periodIncomeTotal(rows), 42500);
    assert.equal(isConfirmedFromRecurring(rows[0]), true);
    assert.equal(isOneTimeIncome(rows[1]), true);
  });

  it("does not add recurring templates on top of confirmed occurrences", () => {
    const confirmed = [income({ amount: 40000, recurringId: "r1" })];
    const templates = [rule({ amount: 40000 })];
    const period = periodIncomeTotal(confirmed);
    const duplicate = period + activeRecurringIncomeBasis(templates, "2026-08-21");
    assert.equal(period, 40000);
    assert.notEqual(period, duplicate);
  });

  it("ignores soft-deleted incomes", () => {
    assert.equal(
      periodIncomeTotal([
        income({ amount: 1000 }),
        income({ id: "i2", amount: 9000, deletedAt: "2026-08-06T00:00:00.000Z" }),
      ]),
      1000,
    );
  });

  it("excludes inactive or ended recurring rules from the income-based basis", () => {
    const templates = [
      rule({ amount: 40000 }),
      rule({ id: "r2", amount: 10000, isActive: false }),
      rule({ id: "r3", amount: 5000, endDate: "2026-07-31" }),
    ];
    assert.equal(activeRecurringIncomeBasis(templates, "2026-08-21"), 40000);
  });
});

describe("income authorization helper", () => {
  it("allows only the creator of a live income", () => {
    const live = income({ amount: 100, createdBy: "carlos" });
    assert.equal(canMutateIncome(live, "carlos"), true);
    assert.equal(canMutateIncome(live, "diana"), false);
    assert.equal(canMutateIncome(live, null), false);
  });

  it("rejects a soft-deleted income even for the creator", () => {
    const deleted = income({
      amount: 100,
      createdBy: "carlos",
      deletedAt: "2026-08-21T12:00:00.000Z",
    });
    assert.equal(canMutateIncome(deleted, "carlos"), false);
  });
});

describe("visible period incomes", () => {
  const range = getMonthRange(2026, 8);

  it("excludes soft-deleted rows and another household", () => {
    const rows = [
      income({
        id: "keep",
        amount: 80,
        occurredAt: "2026-08-20",
        createdAt: "2026-08-20T10:00:00.000Z",
      }),
      income({
        id: "deleted",
        amount: 200,
        occurredAt: "2026-08-21",
        deletedAt: "2026-08-21T12:00:00.000Z",
      }),
      income({
        id: "other",
        householdId: "h2",
        amount: 50,
        occurredAt: "2026-08-21",
      }),
      income({
        id: "july",
        amount: 90,
        occurredAt: "2026-07-31",
      }),
    ];
    const visible = visiblePeriodIncomes(rows, range, "h1");
    assert.deepEqual(visible.map((row) => row.id), ["keep"]);
  });

  it("sorts by date descending then created_at descending", () => {
    const rows = [
      income({
        id: "older",
        amount: 10,
        occurredAt: "2026-08-21",
        createdAt: "2026-08-21T10:00:00.000Z",
      }),
      income({
        id: "newer",
        amount: 20,
        occurredAt: "2026-08-21",
        createdAt: "2026-08-21T18:00:00.000Z",
      }),
      income({
        id: "earlier-day",
        amount: 30,
        occurredAt: "2026-08-10",
        createdAt: "2026-08-10T20:00:00.000Z",
      }),
    ];
    assert.deepEqual(
      visiblePeriodIncomes(rows, range, "h1").map((row) => row.id),
      ["newer", "older", "earlier-day"],
    );
  });

  it("sums one member's confirmed incomes for the current month only", () => {
    const rows = [
      income({ id: "c1", memberId: "carlos", amount: 30000, occurredAt: "2026-08-05" }),
      income({ id: "c2", memberId: "carlos", amount: 5000, occurredAt: "2026-08-20" }),
      income({ id: "d1", memberId: "diana", amount: 10000, occurredAt: "2026-08-10" }),
      income({ id: "old", memberId: "carlos", amount: 99999, occurredAt: "2026-07-31" }),
      income({
        id: "deleted",
        memberId: "carlos",
        amount: 8000,
        occurredAt: "2026-08-12",
        deletedAt: "2026-08-13T00:00:00.000Z",
      }),
    ];
    assert.equal(memberPeriodIncomeTotal(rows, "carlos", range, "h1"), 35000);
    assert.equal(memberPeriodIncomeTotal(rows, "diana", range, "h1"), 10000);
    assert.equal(memberPeriodIncomeTotal(rows, "carlos", getMonthRange(2026, 7), "h1"), 99999);
  });
});
