import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  budgetRemaining,
  budgetSpent,
  budgetUsage,
  buildBudgetItemView,
  buildMonthBudgetView,
  calculateBudgetConsumption,
  canMutateBudget,
  isActiveBudget,
  isBudgetNearLimit,
  isBudgetOver,
  visiblePeriodBudgets,
} from "./budgets.ts";
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
    createdBy: "u1",
    createdAt: "2026-08-01T12:00:00.000Z",
    deletedAt: null,
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
    assert.equal(view.items[0].spent, 20000);
    assert.equal(view.items[0].remaining, 0);
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
    assert.equal(view.items[0].over, true);
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
    assert.equal(view.items.length, 1);
  });

  it("shows an empty budget when none exists and nothing was spent", () => {
    const view = buildMonthBudgetView([], [], range);
    assert.equal(view.hasBudget, false);
    assert.equal(view.totalSpent, 0);
    assert.equal(view.usagePercent, null);
    assert.deepEqual(view.items, []);
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

describe("budgetSpent", () => {
  const plan = budget({ amount: 5000, categoryId: "food" });

  it("returns 0 when there are no expenses", () => {
    assert.equal(budgetSpent(plan, []), 0);
    assert.equal(budgetRemaining(5000, 0), 5000);
    assert.equal(budgetUsage(0, 5000), 0);
    assert.equal(isBudgetOver(5000, 0), false);
  });

  it("ignores deleted expenses", () => {
    const spent = budgetSpent(plan, [
      expense({ amount: 400, categoryId: "food" }),
      expense({ id: "e-del", amount: 900, categoryId: "food", deletedAt: "2026-08-12T00:00:00.000Z" }),
    ]);
    assert.equal(spent, 400);
  });

  it("ignores expenses from another household", () => {
    const spent = budgetSpent(plan, [
      expense({ amount: 400, categoryId: "food" }),
      expense({ id: "e-b", amount: 900, categoryId: "food", householdId: "h2" }),
    ]);
    assert.equal(spent, 400);
  });

  it("ignores expenses outside the budget dates", () => {
    const spent = budgetSpent(plan, [
      expense({ amount: 400, categoryId: "food" }),
      expense({ id: "e-old", amount: 900, categoryId: "food", occurredAt: "2026-07-31" }),
    ]);
    assert.equal(spent, 400);
  });

  it("ignores expenses in another category", () => {
    const spent = budgetSpent(plan, [
      expense({ amount: 400, categoryId: "food" }),
      expense({ id: "e-rent", amount: 900, categoryId: "rent" }),
    ]);
    assert.equal(spent, 400);
  });

  it("does not add recurring_expenses templates; only confirmed expense rows count", () => {
    const spent = budgetSpent(plan, [
      expense({ amount: 250, categoryId: "food", recurringId: "tmpl-1" }),
    ]);
    assert.equal(spent, 250);
  });

  it("does not count a recurring template that was never materialized", () => {
    assert.equal(budgetSpent(plan, []), 0);
  });

  it("marks over and near-limit from derived spent", () => {
    assert.equal(isBudgetOver(1000, 1001), true);
    assert.equal(isBudgetNearLimit(1000, 800), true);
    assert.equal(isBudgetNearLimit(1000, 790), false);
    assert.equal(isBudgetNearLimit(1000, 1001), false);
  });
});

describe("calculateBudgetConsumption", () => {
  const nido = budget({ amount: 200, categoryId: "spotify" });
  const personal = budget({
    id: "b-me",
    amount: 200,
    categoryId: "spotify",
    memberId: "carlos",
    createdBy: "carlos",
  });

  it("returns 0% with no expenses", () => {
    const view = calculateBudgetConsumption(nido, []);
    assert.deepEqual(view, {
      budgetAmount: 200,
      consumed: 0,
      remaining: 200,
      percentage: 0,
    });
  });

  it("returns a partial percentage", () => {
    const view = calculateBudgetConsumption(nido, [
      expense({ amount: 120, categoryId: "spotify" }),
    ]);
    assert.equal(view.consumed, 120);
    assert.equal(view.remaining, 80);
    assert.equal(view.percentage, 60);
  });

  it("returns 100% when consumed equals the budget", () => {
    const view = calculateBudgetConsumption(nido, [
      expense({ amount: 200, categoryId: "spotify" }),
    ]);
    assert.equal(view.consumed, 200);
    assert.equal(view.remaining, 0);
    assert.equal(view.percentage, 100);
  });

  it("allows over-budget consumption above 100% with negative remaining", () => {
    const view = calculateBudgetConsumption(nido, [
      expense({ amount: 250, categoryId: "spotify" }),
    ]);
    assert.equal(view.consumed, 250);
    assert.equal(view.remaining, -50);
    assert.equal(view.percentage, 125);
    assert.equal(isBudgetOver(view.budgetAmount, view.consumed), true);
  });

  it("avoids dividing by zero when amount is not positive", () => {
    const zero = budget({ amount: 0, categoryId: "spotify" });
    const view = calculateBudgetConsumption(zero, [
      expense({ amount: 10, categoryId: "spotify" }),
    ]);
    assert.equal(view.percentage, null);
    assert.equal(view.remaining, -10);
  });

  it("counts the same category_id and ignores a different category", () => {
    const spent = budgetSpent(nido, [
      expense({ id: "e-spot", amount: 80, categoryId: "spotify" }),
      expense({ id: "e-rent", amount: 900, categoryId: "rent" }),
    ]);
    assert.equal(spent, 80);
  });

  it("still counts historical spend after the category is archived", () => {
    const archivedCategoryExpense = expense({
      amount: 40,
      categoryId: "spotify",
      category: { id: "spotify", name: "Spotify", icon: "🎵" },
    });
    assert.equal(budgetSpent(nido, [archivedCategoryExpense]), 40);
  });

  it("counts a date inside the month and rejects dates outside, including month edges", () => {
    const spent = budgetSpent(nido, [
      expense({ id: "e-jul", amount: 10, categoryId: "spotify", occurredAt: "2026-07-31" }),
      expense({ id: "e-first", amount: 20, categoryId: "spotify", occurredAt: "2026-08-01" }),
      expense({ id: "e-last", amount: 30, categoryId: "spotify", occurredAt: "2026-08-31" }),
      expense({ id: "e-sep", amount: 40, categoryId: "spotify", occurredAt: "2026-09-01" }),
    ]);
    assert.equal(spent, 50);
  });

  it("lets a Nido budget consume visible shared and personal expenses (D5)", () => {
    const spent = budgetSpent(nido, [
      expense({ id: "e-shared", amount: 80, categoryId: "spotify", scope: "shared" }),
      expense({
        id: "e-personal",
        amount: 40,
        categoryId: "spotify",
        scope: "personal",
        createdBy: "carlos",
        payerId: "carlos",
        distributionMethod: "fixed",
      }),
    ]);
    assert.equal(spent, 120);
  });

  it("lets a personal budget consume only the owner's personal expenses", () => {
    const spent = budgetSpent(personal, [
      expense({
        id: "e-me",
        amount: 90,
        categoryId: "spotify",
        scope: "personal",
        createdBy: "carlos",
        payerId: "carlos",
        distributionMethod: "fixed",
      }),
      expense({
        id: "e-other",
        amount: 70,
        categoryId: "spotify",
        scope: "personal",
        createdBy: "diana",
        payerId: "diana",
        distributionMethod: "fixed",
      }),
      expense({ id: "e-shared", amount: 50, categoryId: "spotify", scope: "shared" }),
    ]);
    assert.equal(spent, 90);
  });

  it("does not let a shared expense consume a personal budget", () => {
    assert.equal(
      budgetSpent(personal, [expense({ amount: 200, categoryId: "spotify", scope: "shared" })]),
      0,
    );
  });

  it("does not count a soft-deleted expense", () => {
    const spent = budgetSpent(nido, [
      expense({ amount: 40, categoryId: "spotify" }),
      expense({
        id: "e-del",
        amount: 90,
        categoryId: "spotify",
        deletedAt: "2026-08-12T00:00:00.000Z",
      }),
    ]);
    assert.equal(spent, 40);
  });

  it("does not invent private personal spend that RLS omitted from the snapshot", () => {
    const hiddenFromPeer = calculateBudgetConsumption(nido, [
      expense({ id: "e-shared", amount: 80, categoryId: "spotify", scope: "shared" }),
    ]);
    const ownerView = calculateBudgetConsumption(nido, [
      expense({ id: "e-shared", amount: 80, categoryId: "spotify", scope: "shared" }),
      expense({
        id: "e-private",
        amount: 40,
        categoryId: "spotify",
        scope: "personal",
        createdBy: "carlos",
        payerId: "carlos",
        distributionMethod: "fixed",
      }),
    ]);
    assert.equal(hiddenFromPeer.consumed, 80);
    assert.equal(ownerView.consumed, 120);
    assert.equal(
      calculateBudgetConsumption(personal, [
        expense({ id: "e-shared", amount: 80, categoryId: "spotify", scope: "shared" }),
      ]).consumed,
      0,
    );
  });

  it("builds a list item from the same consumption", () => {
    const item = buildBudgetItemView(
      personal,
      [
        expense({
          amount: 120,
          categoryId: "spotify",
          scope: "personal",
          createdBy: "carlos",
          payerId: "carlos",
        }),
      ],
      [
        {
          userId: "carlos",
          role: "member",
          joinedAt: "2026-01-01T00:00:00.000Z",
          displayName: "Carlos Pérez",
          avatarUrl: null,
        },
      ],
    );
    assert.equal(item.spent, 120);
    assert.equal(item.remaining, 80);
    assert.equal(item.usagePercent, 60);
    assert.equal(item.memberName, "Carlos Pérez");
  });
});

describe("budget visibility and mutation", () => {
  it("hides deleted budgets from the period list", () => {
    const live = budget({ amount: 1000, categoryId: "food" });
    const deleted = budget({
      id: "b-del",
      amount: 9000,
      categoryId: "food",
      deletedAt: "2026-08-12T00:00:00.000Z",
    });
    assert.equal(isActiveBudget(live), true);
    assert.equal(isActiveBudget(deleted), false);
    assert.equal(visiblePeriodBudgets([live, deleted], range, "h1").length, 1);
    assert.equal(buildMonthBudgetView([live, deleted], [], range).totalBudget, 1000);
  });

  it("allows only the creator of a live budget to mutate", () => {
    const live = budget({ amount: 1000, categoryId: "food", createdBy: "carlos" });
    const deleted = { ...live, deletedAt: "2026-08-12T00:00:00.000Z" };
    assert.equal(canMutateBudget(live, "carlos"), true);
    assert.equal(canMutateBudget(live, "diana"), false);
    assert.equal(canMutateBudget(live, null), false);
    assert.equal(canMutateBudget(deleted, "carlos"), false);
  });

  it("does not let a member mutate another member's personal budget", () => {
    const personal = budget({
      amount: 200,
      categoryId: "spotify",
      createdBy: "carlos",
      memberId: "carlos",
    });
    assert.equal(canMutateBudget(personal, "carlos"), true);
    assert.equal(canMutateBudget(personal, "diana"), false);
    assert.equal(
      canMutateBudget({ ...personal, createdBy: "diana", memberId: "carlos" }, "diana"),
      false,
    );
  });

  it("lists personal budgets in the period list without mixing them into Nido totals", () => {
    const nido = budget({ amount: 20000, categoryId: "rent" });
    const personal = budget({
      id: "b-me",
      amount: 200,
      categoryId: "spotify",
      memberId: "carlos",
      category: { id: "spotify", name: "Spotify", icon: "🎵" },
    });
    const listed = visiblePeriodBudgets([nido, personal], range, "h1");
    assert.equal(listed.length, 2);
    assert.equal(listed[0].memberId, null);
    assert.equal(listed[1].memberId, "carlos");
    assert.equal(buildMonthBudgetView([nido, personal], [], range).totalBudget, 20000);
  });
});
