import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  activeRecurringIncomeBasis,
  isConfirmedFromRecurring,
  isOneTimeIncome,
  periodIncomeTotal,
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
