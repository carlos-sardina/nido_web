import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeActivityScopeHealth } from "./activity-health.ts";
import { computeHealth } from "./health.ts";
import type { BudgetItemView, ExpenseRow, GoalRow, IncomeRow } from "./types.ts";

const householdHealth = computeHealth({
  incomeThisMonth: 100000,
  spentThisMonth: 65000,
  budgetTotal: 60000,
  activeGoalCount: 2,
  emergencyMonths: 3,
  hasAnyFinancialData: true,
});

function expense(overrides: Partial<ExpenseRow> & Pick<ExpenseRow, "id" | "amount" | "scope">): ExpenseRow {
  return {
    householdId: "h1",
    categoryId: "c1",
    description: null,
    occurredAt: "2026-08-10",
    payerId: "carlos",
    distributionMethod: "equal",
    recurringId: null,
    createdBy: overrides.payerId ?? "carlos",
    createdAt: "2026-08-10T12:00:00.000Z",
    deletedAt: null,
    category: null,
    payer: null,
    splits: [],
    ...overrides,
  };
}

function income(overrides: Partial<IncomeRow> & Pick<IncomeRow, "id" | "amount" | "memberId">): IncomeRow {
  return {
    householdId: "h1",
    categoryId: "c2",
    description: null,
    occurredAt: "2026-08-01",
    recurringId: null,
    createdBy: overrides.memberId,
    createdAt: "2026-08-01T12:00:00.000Z",
    deletedAt: null,
    category: null,
    member: null,
    ...overrides,
  };
}

function budget(
  overrides: Partial<BudgetItemView> & Pick<BudgetItemView, "id" | "amount" | "memberId">,
): BudgetItemView {
  return {
    householdId: "h1",
    categoryId: "c1",
    name: "Casa",
    icon: "🏠",
    spent: 0,
    remaining: overrides.amount,
    usagePercent: 0,
    over: false,
    nearLimit: false,
    startDate: "2026-08-01",
    endDate: "2026-08-31",
    createdBy: overrides.memberId ?? "carlos",
    deletedAt: null,
    memberName: null,
    ...overrides,
  };
}

function goal(overrides: Partial<GoalRow> & Pick<GoalRow, "id" | "scope" | "createdBy">): GoalRow {
  return {
    householdId: "h1",
    name: "Fondo",
    description: null,
    goalType: "saving",
    targetAmount: 10000,
    targetDate: null,
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    contributions: [],
    ...overrides,
  };
}

const mixed = {
  household: {
    income: 100000,
    spent: 65000,
    health: householdHealth,
    emergencyMonths: 3 as number | null,
  },
  periodExpenses: [
    expense({ id: "e-shared", amount: 50000, scope: "shared", payerId: "carlos" }),
    expense({ id: "e-carlos", amount: 10000, scope: "personal", payerId: "carlos" }),
    expense({ id: "e-diana", amount: 5000, scope: "personal", payerId: "diana", createdBy: "diana" }),
  ],
  periodIncomes: [
    income({ id: "i-carlos", amount: 60000, memberId: "carlos" }),
    income({ id: "i-diana", amount: 40000, memberId: "diana" }),
  ],
  periodBudgets: [
    budget({ id: "b-nido", amount: 60000, memberId: null }),
    budget({ id: "b-carlos", amount: 12000, memberId: "carlos" }),
    budget({ id: "b-diana", amount: 8000, memberId: "diana" }),
  ],
  goals: [
    goal({ id: "g-shared", scope: "shared", createdBy: "diana" }),
    goal({ id: "g-carlos", scope: "personal", createdBy: "carlos" }),
  ],
};

describe("activity scope health", () => {
  it("reuses the household score under 'todo'", () => {
    const scoped = computeActivityScopeHealth({
      ...mixed,
      filter: "all",
      viewerId: "carlos",
    });
    assert.equal(scoped.incomeThisMonth, 100000);
    assert.equal(scoped.spentThisMonth, 65000);
    assert.equal(scoped.health, householdHealth);
  });

  it("scores compartido with household income and only shared spend", () => {
    const scoped = computeActivityScopeHealth({
      ...mixed,
      filter: "shared",
      viewerId: "carlos",
    });
    assert.equal(scoped.incomeThisMonth, 100000);
    assert.equal(scoped.spentThisMonth, 50000);
    assert.equal(scoped.health.available, true);
    if (scoped.health.available && householdHealth.available) {
      assert.equal(scoped.health.savingsRatePercent, 50);
      assert.equal(scoped.health.budgetUsagePercent, 83);
      assert.equal(scoped.health.emergencyMonths, 3);
      assert.notEqual(scoped.health.label, householdHealth.label);
      assert.equal(scoped.health.label, "Excelente");
      assert.equal(householdHealth.label, "Estable");
    }
  });

  it("ignores personal expenses and personal budgets under 'compartido'", () => {
    const scoped = computeActivityScopeHealth({
      ...mixed,
      filter: "shared",
      viewerId: "carlos",
      periodExpenses: mixed.periodExpenses.filter((row) => row.scope === "personal"),
      periodBudgets: mixed.periodBudgets.filter((row) => row.memberId != null),
    });
    assert.equal(scoped.spentThisMonth, 0);
    assert.equal(scoped.health.available, true);
    if (scoped.health.available) {
      assert.equal(scoped.health.budgetUsagePercent, null);
      assert.equal(scoped.health.emergencyMonths, 3);
    }
  });

  it("scores personal with the viewer's income, spend, and budgets", () => {
    const scoped = computeActivityScopeHealth({
      ...mixed,
      filter: "personal",
      viewerId: "carlos",
    });
    assert.equal(scoped.incomeThisMonth, 60000);
    assert.equal(scoped.spentThisMonth, 10000);
    assert.equal(scoped.health.available, true);
    if (scoped.health.available && householdHealth.available) {
      assert.equal(scoped.health.savingsRatePercent, 83);
      assert.equal(scoped.health.budgetUsagePercent, 83);
      assert.equal(scoped.health.emergencyMonths, null);
      assert.notEqual(scoped.health.label, householdHealth.label);
      assert.equal(scoped.health.label, "Excelente");
    }
  });

  it("does not mix another member's personal money into 'personal'", () => {
    const scoped = computeActivityScopeHealth({
      ...mixed,
      filter: "personal",
      viewerId: "carlos",
    });
    const diana = computeActivityScopeHealth({
      ...mixed,
      filter: "personal",
      viewerId: "diana",
    });
    assert.equal(scoped.incomeThisMonth, 60000);
    assert.equal(scoped.spentThisMonth, 10000);
    assert.equal(diana.incomeThisMonth, 40000);
    assert.equal(diana.spentThisMonth, 5000);
  });

  it("is unavailable for personal without a viewer or personal signal", () => {
    const noViewer = computeActivityScopeHealth({
      ...mixed,
      filter: "personal",
      viewerId: null,
    });
    assert.equal(noViewer.health.available, false);

    const empty = computeActivityScopeHealth({
      household: {
        income: 0,
        spent: 0,
        health: { available: false },
        emergencyMonths: null,
      },
      periodExpenses: [],
      periodIncomes: [],
      periodBudgets: [],
      goals: [],
      filter: "personal",
      viewerId: "carlos",
    });
    assert.equal(empty.health.available, false);
  });
});
