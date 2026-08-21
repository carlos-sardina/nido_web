import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildDashboardViewModel } from "./dashboard.ts";
import { getMonthRange } from "./dates.ts";
import type { DashboardSnapshot, ExpenseRow, GoalRow, IncomeRow } from "./types.ts";
import type { HouseholdMemberView } from "../types.ts";

const range = getMonthRange(2026, 8);
const members: HouseholdMemberView[] = [
  {
    userId: "diana",
    role: "owner",
    joinedAt: "2026-01-01T00:00:00.000Z",
    displayName: "Diana Vega",
    avatarUrl: null,
  },
];

function emptySnapshot(overrides: Partial<DashboardSnapshot> = {}): DashboardSnapshot {
  return {
    householdId: "h1",
    range,
    expenses: [],
    periodExpenses: [],
    incomes: [],
    periodIncomes: [],
    recurringIncomes: [],
    recurringExpenses: [],
    budgets: [],
    goals: [],
    contributions: [],
    ...overrides,
  };
}

describe("dashboard view model", () => {
  it("exposes empty states instead of mock numbers", () => {
    const model = buildDashboardViewModel({
      snapshot: emptySnapshot(),
      members,
      range,
      now: new Date("2026-08-21T16:00:00.000Z"),
    });

    assert.equal(model.hasAnyFinancialData, false);
    assert.equal(model.health.available, false);
    assert.equal(model.periodIncome, 0);
    assert.equal(model.periodSpent, 0);
    assert.equal(model.empty.expenses, true);
    assert.equal(model.empty.incomes, true);
    assert.equal(model.empty.goals, true);
    assert.equal(model.empty.activity, true);
    assert.equal(model.empty.budget, true);
    assert.equal(model.featuredGoal, null);
    assert.deepEqual(model.activity, []);
    assert.equal(model.greeting, "Buenos días");
  });

  it("uses confirmed period totals and derived goal progress", () => {
    const expense: ExpenseRow = {
      id: "e1",
      householdId: "h1",
      categoryId: "c1",
      amount: 700,
      description: "Internet",
      occurredAt: "2026-08-21",
      payerId: "diana",
      scope: "shared",
      distributionMethod: "equal",
      recurringId: null,
      createdBy: "diana",
      createdAt: "2026-08-21T12:00:00.000Z",
      deletedAt: null,
      category: { id: "c1", name: "Internet", icon: "📡" },
      payer: { id: "diana", displayName: "Diana Vega" },
      splits: [{ id: "s1", expenseId: "e1", memberId: "diana", amount: 700, percentage: 100 }],
    };
    const income: IncomeRow = {
      id: "i1",
      householdId: "h1",
      memberId: "diana",
      categoryId: "c2",
      amount: 40000,
      description: "Sueldo",
      occurredAt: "2026-08-01",
      recurringId: "r1",
      createdBy: "diana",
      createdAt: "2026-08-01T12:00:00.000Z",
      deletedAt: null,
      category: null,
      member: { id: "diana", displayName: "Diana Vega" },
    };
    const goal: GoalRow = {
      id: "g1",
      householdId: "h1",
      name: "Fondo de emergencia",
      description: null,
      goalType: "saving",
      targetAmount: 200000,
      targetDate: null,
      status: "active",
      createdBy: "diana",
      createdAt: "2026-01-01T00:00:00.000Z",
      contributions: [
        {
          id: "gc1",
          goalId: "g1",
          memberId: "diana",
          amount: 120000,
          contributedAt: "2026-08-02",
          createdBy: "diana",
          createdAt: "2026-08-02T12:00:00.000Z",
          member: null,
        },
      ],
    };

    const model = buildDashboardViewModel({
      snapshot: emptySnapshot({
        expenses: [expense],
        periodExpenses: [expense],
        incomes: [income],
        periodIncomes: [income],
        recurringIncomes: [
          {
            id: "r1",
            householdId: "h1",
            memberId: "diana",
            amount: 40000,
            description: "Sueldo",
            isActive: true,
            frequency: "monthly",
            endDate: null,
          },
        ],
        goals: [goal],
        contributions: goal.contributions,
        budgets: [
          {
            id: "b1",
            householdId: "h1",
            memberId: null,
            categoryId: "c1",
            amount: 800,
            period: "monthly",
            startDate: "2026-08-01",
            endDate: "2026-08-31",
            category: { id: "c1", name: "Internet", icon: "📡" },
          },
        ],
      }),
      members,
      range,
    });

    assert.equal(model.periodIncome, 40000);
    assert.equal(model.periodSpent, 700);
    assert.equal(model.empty.expenses, false);
    assert.equal(model.empty.incomes, false);
    assert.equal(model.empty.goals, false);
    assert.equal(model.featuredGoal?.contributed, 120000);
    assert.equal(model.featuredGoal?.percent, 60);
    assert.equal(model.budget.totalBudget, 800);
    assert.equal(model.budget.totalSpent, 700);
    assert.equal(model.activity.length, 3);
    assert.equal(model.health.available, true);
    if (model.health.available) {
      assert.equal(model.health.savingsRatePercent, 98);
    }
  });

  it("does not count a recurring template twice when an occurrence is confirmed", () => {
    const income: IncomeRow = {
      id: "i1",
      householdId: "h1",
      memberId: "diana",
      categoryId: "c2",
      amount: 30000,
      description: "Sueldo",
      occurredAt: "2026-08-01",
      recurringId: "r1",
      createdBy: "diana",
      createdAt: "2026-08-01T12:00:00.000Z",
      deletedAt: null,
      category: null,
      member: null,
    };
    const model = buildDashboardViewModel({
      snapshot: emptySnapshot({
        periodIncomes: [income],
        incomes: [income],
        recurringIncomes: [
          {
            id: "r1",
            householdId: "h1",
            memberId: "diana",
            amount: 30000,
            description: "Sueldo",
            isActive: true,
            frequency: "monthly",
            endDate: null,
          },
        ],
      }),
      members,
      range,
    });
    assert.equal(model.periodIncome, 30000);
  });

  it("adds a confirmed expense to monthly spent and activity without using splits twice", () => {
    const expense: ExpenseRow = {
      id: "e-new",
      householdId: "h1",
      categoryId: "c1",
      amount: 1200,
      description: "Supermercado",
      occurredAt: "2026-08-21",
      payerId: "diana",
      scope: "personal",
      distributionMethod: "fixed",
      recurringId: null,
      createdBy: "diana",
      createdAt: "2026-08-21T18:00:00.000Z",
      deletedAt: null,
      category: { id: "c1", name: "Despensa", icon: "🛒" },
      payer: { id: "diana", displayName: "Diana Vega" },
      splits: [{ id: "s1", expenseId: "e-new", memberId: "diana", amount: 1200, percentage: 100 }],
    };

    const model = buildDashboardViewModel({
      snapshot: emptySnapshot({
        expenses: [expense],
        periodExpenses: [expense],
      }),
      members,
      range,
      now: new Date("2026-08-21T20:00:00.000Z"),
    });

    assert.equal(model.periodSpent, 1200);
    assert.equal(model.activity.length, 1);
    assert.equal(model.activity[0].id, "expense:e-new");
    assert.match(model.activity[0].title, /Supermercado/);
    assert.equal(model.empty.expenses, false);
    assert.equal(model.empty.activity, false);
  });

  it("does not add an out-of-month expense to the monthly total", () => {
    const july: ExpenseRow = {
      id: "e-july",
      householdId: "h1",
      categoryId: "c1",
      amount: 5000,
      description: "Renta",
      occurredAt: "2026-07-31",
      payerId: "diana",
      scope: "personal",
      distributionMethod: "fixed",
      recurringId: null,
      createdBy: "diana",
      createdAt: "2026-07-31T12:00:00.000Z",
      deletedAt: null,
      category: { id: "c1", name: "Vivienda", icon: "🏠" },
      payer: null,
      splits: [{ id: "s1", expenseId: "e-july", memberId: "diana", amount: 5000, percentage: 100 }],
    };

    const model = buildDashboardViewModel({
      snapshot: emptySnapshot({
        expenses: [july],
        periodExpenses: [],
      }),
      members,
      range,
    });

    assert.equal(model.periodSpent, 0);
    assert.equal(model.activity[0]?.id, "expense:e-july");
  });

  it("does not treat recurring_expenses templates as confirmed spending", () => {
    const model = buildDashboardViewModel({
      snapshot: emptySnapshot({
        recurringExpenses: [
          {
            id: "re1",
            householdId: "h1",
            amount: 8000,
            description: "Renta",
            scope: "shared",
            isActive: true,
            frequency: "monthly",
          },
        ],
      }),
      members,
      range,
    });

    assert.equal(model.periodSpent, 0);
    assert.equal(model.hasAnyFinancialData, false);
    assert.deepEqual(model.activity, []);
  });
});
