import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NidoError } from "../errors.ts";
import {
  contributionHouseholdId,
  mapBudgetRow,
  mapCategoryRow,
  mapContributionRow,
  mapExpenseRow,
  mapGoalRow,
  mapIncomeRow,
} from "../queries/map.ts";

describe("query row mapping", () => {
  it("parses numeric strings and nested category/split embeds", () => {
    const expense = mapExpenseRow({
      id: "e1",
      household_id: "h1",
      category_id: "c1",
      amount: "4280.00",
      description: "Super Walmart",
      occurred_at: "2026-08-21",
      payer_id: "diana",
      scope: "shared",
      distribution_method: "income_based",
      recurring_id: null,
      created_by: "diana",
      created_at: "2026-08-21T12:00:00.000Z",
      deleted_at: null,
      categories: { id: "c1", name: "Supermercado", icon: "🛒" },
      expense_splits: [
        { id: "s1", member_id: "diana", amount: "2825.00", percentage: "66.0000" },
        { id: "s2", member_id: "carlos", amount: "1455.00", percentage: "34.0000" },
      ],
      payer: { id: "diana", display_name: "Diana Vega" },
    });

    assert.equal(expense.amount, 4280);
    assert.equal(expense.category?.name, "Supermercado");
    assert.equal(expense.splits.length, 2);
    assert.equal(expense.splits[0].amount, 2825);
    assert.equal(expense.payer?.displayName, "Diana Vega");
  });

  it("maps a one-time income separately from a recurring origin", () => {
    const income = mapIncomeRow({
      id: "i1",
      household_id: "h1",
      member_id: "carlos",
      category_id: "c2",
      amount: 2500,
      description: "Freelance",
      occurred_at: "2026-08-12",
      recurring_id: null,
      created_by: "carlos",
      created_at: "2026-08-12T12:00:00.000Z",
      deleted_at: null,
      categories: [{ id: "c2", name: "Extra", icon: null }],
    });
    assert.equal(income.recurringId, null);
    assert.equal(income.category?.name, "Extra");
  });

  it("derives goal contributions from the child embed", () => {
    const goal = mapGoalRow({
      id: "g1",
      household_id: "h1",
      name: "Japón",
      description: null,
      goal_type: "purchase",
      target_amount: "80000",
      target_date: "2027-03-01",
      status: "active",
      created_by: "diana",
      created_at: "2026-01-01T00:00:00.000Z",
      goal_contributions: [
        {
          id: "gc1",
          goal_id: "g1",
          member_id: "diana",
          amount: "4000",
          contributed_at: "2026-08-04",
          created_by: "diana",
          created_at: "2026-08-04T00:00:00.000Z",
          deleted_at: null,
        },
      ],
    });
    assert.equal(goal.targetAmount, 80000);
    assert.equal(goal.contributions[0].amount, 4000);
    assert.equal(goal.contributions[0].deletedAt, null);
  });

  it("scopes contribution activity to the active household", () => {
    const row = {
      id: "gc1",
      goal_id: "g1",
      member_id: "diana",
      amount: 10,
      contributed_at: "2026-08-01",
      created_by: "diana",
      created_at: "2026-08-01T00:00:00.000Z",
      deleted_at: null,
      goals: { id: "g1", name: "Viejo", household_id: "other-nido" },
    };
    assert.equal(contributionHouseholdId(row), "other-nido");
    assert.notEqual(contributionHouseholdId(row), "h1");
    assert.equal(mapContributionRow(row).goalId, "g1");
  });

  it("maps a budget without inventing spent", () => {
    const budget = mapBudgetRow({
      id: "b1",
      household_id: "h1",
      member_id: null,
      category_id: "c1",
      amount: "8000.00",
      period: "monthly",
      start_date: "2026-08-01",
      end_date: "2026-08-31",
      created_by: "carlos",
      created_at: "2026-08-01T12:00:00.000Z",
      deleted_at: null,
      categories: { id: "c1", name: "Vivienda", icon: "🏠" },
    });
    assert.equal(budget.amount, 8000);
    assert.equal(budget.memberId, null);
    assert.equal(budget.deletedAt, null);
    assert.equal(budget.createdBy, "carlos");
    assert.equal(budget.category?.name, "Vivienda");
    assert.equal("spent" in budget, false);
    assert.equal("currentSpent" in budget, false);
  });

  it("maps household category fields including is_default", () => {
    const category = mapCategoryRow({
      id: "c1",
      household_id: "h1",
      name: "Vivienda",
      icon: "🏠",
      type: "expense",
      is_default: true,
      archived_at: null,
    });
    assert.equal(category.householdId, "h1");
    assert.equal(category.isDefault, true);
    assert.equal(category.name, "Vivienda");
  });
});

describe("dashboard error copy", () => {
  it("never surfaces a raw Supabase message", () => {
    const error = new NidoError("network", "No pudimos cargar tus datos. Inténtalo de nuevo.");
    assert.equal(error.message.includes("JWT"), false);
    assert.equal(error.message.includes("row-level"), false);
    assert.match(error.message, /datos/i);
  });

  it("uses not_a_member when there is no active household", () => {
    const error = new NidoError("not_a_member");
    assert.match(error.message, /Nido activo/i);
  });
});
