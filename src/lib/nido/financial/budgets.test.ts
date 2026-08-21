import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildMonthBudgetView } from "./budgets.ts";
import { getMonthRange } from "./dates.ts";
import type { BudgetRow, ExpenseRow } from "./types.ts";

const range = getMonthRange(2026, 8);

function budget(partial: Partial<BudgetRow> & Pick<BudgetRow, "amount" | "categoryId">): BudgetRow {
  return {
    id: partial.id ?? `b-${partial.categoryId}`,
    householdId: "h1",
    memberId: null,
    period: "monthly",
    startDate: "2026-08-01",
    endDate: "2026-08-31",
    category: { id: partial.categoryId, name: "Renta", icon: "🏠" },
    ...partial,
  };
}

function expense(partial: Partial<ExpenseRow> & Pick<ExpenseRow, "amount" | "categoryId">): ExpenseRow {
  return {
    id: partial.id ?? "e1",
    householdId: "h1",
    description: null,
    occurredAt: "2026-08-10",
    payerId: "u1",
    scope: "shared",
    distributionMethod: "equal",
    recurringId: null,
    createdBy: "u1",
    createdAt: "2026-08-10T12:00:00.000Z",
    deletedAt: null,
    category: { id: partial.categoryId, name: "Renta", icon: "🏠" },
    payer: null,
    splits: [],
    ...partial,
  };
}

describe("month budget view", () => {
  it("derives spent from expenses and keeps budget.amount as the target", () => {
    const view = buildMonthBudgetView(
      [budget({ amount: 20000, categoryId: "rent" })],
      [expense({ amount: 20000, categoryId: "rent" })],
      range,
    );
    assert.equal(view.hasBudget, true);
    assert.equal(view.totalBudget, 20000);
    assert.equal(view.totalSpent, 20000);
    assert.equal(view.over, false);
    assert.equal(view.usagePercent, 100);
    assert.equal(view.categories[0].spent, 20000);
  });

  it("allows spending past the target", () => {
    const view = buildMonthBudgetView(
      [budget({ amount: 4000, categoryId: "food", category: { id: "food", name: "Restaurantes", icon: "🍔" } })],
      [expense({ amount: 4280, categoryId: "food" })],
      range,
    );
    assert.equal(view.over, true);
    assert.equal(view.remaining, -280);
    assert.equal(view.usagePercent, 107);
  });

  it("ignores personal budgets in the Nido monthly total", () => {
    const view = buildMonthBudgetView(
      [
        budget({ amount: 20000, categoryId: "rent" }),
        budget({ id: "b-me", amount: 5000, categoryId: "gym", memberId: "u1" }),
      ],
      [],
      range,
    );
    assert.equal(view.totalBudget, 20000);
  });

  it("shows an empty budget when none exists and nothing was spent", () => {
    const view = buildMonthBudgetView([], [], range);
    assert.equal(view.hasBudget, false);
    assert.equal(view.totalSpent, 0);
    assert.equal(view.usagePercent, null);
  });

  it("still reports real spending when there is no budget row", () => {
    const view = buildMonthBudgetView(
      [],
      [expense({ amount: 700, categoryId: "net", category: { id: "net", name: "Internet", icon: "📡" } })],
      range,
    );
    assert.equal(view.hasBudget, false);
    assert.equal(view.totalSpent, 700);
    assert.equal(view.categories[0].name, "Internet");
  });

  it("excludes budgets that do not overlap the current month", () => {
    const view = buildMonthBudgetView(
      [budget({ amount: 999, categoryId: "old", startDate: "2026-07-01", endDate: "2026-07-31" })],
      [],
      range,
    );
    assert.equal(view.hasBudget, false);
  });
});
