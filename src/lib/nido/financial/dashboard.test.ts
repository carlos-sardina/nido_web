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
    assert.deepEqual(model.goals, []);
    assert.deepEqual(model.activity, []);
    assert.deepEqual(model.periodIncomes, []);
    assert.deepEqual(model.periodBudgets, []);
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
          deletedAt: null,
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
            createdBy: "diana",
            createdAt: "2026-08-01T12:00:00.000Z",
            deletedAt: null,
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
    assert.equal(model.periodIncomes.length, 1);
    assert.equal(model.periodIncomes[0].id, "i1");
    assert.equal(model.empty.goals, false);
    assert.equal(model.featuredGoal?.contributed, 120000);
    assert.equal(model.featuredGoal?.percent, 60);
    assert.equal(model.goals.length, 1);
    assert.equal(model.goals[0].contributions[0].amount, 120000);
    assert.equal(model.budget.totalBudget, 800);
    assert.equal(model.budget.totalSpent, 700);
    assert.equal(model.periodBudgets.length, 1);
    assert.equal(model.periodBudgets[0].spent, 700);
    assert.equal(model.periodBudgets[0].remaining, 100);
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
    assert.equal(model.periodExpenses.length, 1);
    assert.equal(model.periodExpenses[0].id, "e-new");
  });

  it("drops a soft-deleted expense from totals, period list, and activity", () => {
    const live: ExpenseRow = {
      id: "e-live",
      householdId: "h1",
      categoryId: "c1",
      amount: 400,
      description: "Cafe",
      occurredAt: "2026-08-21",
      payerId: "diana",
      scope: "personal",
      distributionMethod: "fixed",
      recurringId: null,
      createdBy: "diana",
      createdAt: "2026-08-21T10:00:00.000Z",
      deletedAt: null,
      category: { id: "c1", name: "Restaurantes", icon: "🍽️" },
      payer: { id: "diana", displayName: "Diana Vega" },
      splits: [{ id: "s1", expenseId: "e-live", memberId: "diana", amount: 400, percentage: 100 }],
    };
    const deleted: ExpenseRow = {
      ...live,
      id: "e-gone",
      amount: 9000,
      deletedAt: "2026-08-21T12:00:00.000Z",
    };

    const model = buildDashboardViewModel({
      snapshot: emptySnapshot({
        expenses: [live, deleted],
        periodExpenses: [live, deleted],
      }),
      members,
      range,
    });

    assert.equal(model.periodSpent, 400);
    assert.deepEqual(model.periodExpenses.map((row) => row.id), ["e-live"]);
    assert.equal(model.activity.some((item) => item.id === "expense:e-gone"), false);
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

  it("includes a materialized recurring expense in spent, budget, health, and activity", () => {
    const materialized: ExpenseRow = {
      id: "e-rent",
      householdId: "h1",
      categoryId: "c1",
      amount: 8000,
      description: "Renta",
      occurredAt: "2026-08-01",
      payerId: "diana",
      scope: "personal",
      distributionMethod: "fixed",
      recurringId: "re1",
      createdBy: "diana",
      createdAt: "2026-08-01T12:00:00.000Z",
      deletedAt: null,
      category: { id: "c1", name: "Vivienda", icon: "🏠" },
      payer: { id: "diana", displayName: "Diana Vega" },
      splits: [{ id: "s1", expenseId: "e-rent", memberId: "diana", amount: 8000, percentage: 100 }],
    };

    const model = buildDashboardViewModel({
      snapshot: emptySnapshot({
        expenses: [materialized],
        periodExpenses: [materialized],
        recurringExpenses: [
          {
            id: "re1",
            householdId: "h1",
            amount: 8000,
            description: "Renta",
            scope: "personal",
            isActive: true,
            frequency: "monthly",
          },
        ],
      }),
      members,
      range,
    });

    assert.equal(model.periodSpent, 8000);
    assert.equal(model.hasAnyFinancialData, true);
    assert.equal(model.activity.some((item) => item.id === "expense:e-rent"), true);
    assert.equal(model.activity.some((item) => item.id.startsWith("recurring")), false);
  });

  it("excludes archived goals from the Metas list and keeps derived progress", () => {
    const archived: GoalRow = {
      id: "g-old",
      householdId: "h1",
      name: "Vieja",
      description: null,
      goalType: "saving",
      targetAmount: 100,
      targetDate: null,
      status: "archived",
      createdBy: "diana",
      createdAt: "2026-01-01T00:00:00.000Z",
      contributions: [
        {
          id: "gc-old",
          goalId: "g-old",
          memberId: "diana",
          amount: 40,
          contributedAt: "2026-02-01",
          createdBy: "diana",
          createdAt: "2026-02-01T12:00:00.000Z",
          deletedAt: null,
          member: null,
        },
      ],
    };
    const live: GoalRow = {
      ...archived,
      id: "g-new",
      name: "Nueva",
      status: "active",
      contributions: [],
    };

    const model = buildDashboardViewModel({
      snapshot: emptySnapshot({ goals: [archived, live] }),
      members,
      range,
    });

    assert.deepEqual(model.goals.map((row) => row.id), ["g-new"]);
    assert.equal(model.activeGoals.length, 1);
    assert.equal(model.activeGoals[0].contributed, 0);
    assert.equal(model.empty.goals, false);
  });

  it("caps visual progress at 100% when contributions exceed the target", () => {
    const goal: GoalRow = {
      id: "g1",
      householdId: "h1",
      name: "Fondo",
      description: null,
      goalType: "saving",
      targetAmount: 100,
      targetDate: null,
      status: "active",
      createdBy: "diana",
      createdAt: "2026-01-01T00:00:00.000Z",
      contributions: [
        {
          id: "gc1",
          goalId: "g1",
          memberId: "diana",
          amount: 150,
          contributedAt: "2026-08-21",
          createdBy: "diana",
          createdAt: "2026-08-21T12:00:00.000Z",
          deletedAt: null,
          member: { id: "diana", displayName: "Diana Vega" },
        },
      ],
    };

    const model = buildDashboardViewModel({
      snapshot: emptySnapshot({
        goals: [goal],
        contributions: goal.contributions,
      }),
      members,
      range,
    });

    assert.equal(model.activeGoals[0].contributed, 150);
    assert.equal(model.activeGoals[0].percent, 100);
    assert.equal(model.activeGoals[0].completed, true);
    assert.equal(model.featuredGoal?.percent, 100);
    assert.equal(model.activity.some((item) => item.type === "goal_contribution"), true);
    assert.equal(model.activity[0]?.amount, 150);
  });

  it("drops a soft-deleted contribution from progress and activity", () => {
    const live = {
      id: "gc-live",
      goalId: "g1",
      memberId: "diana",
      amount: 40,
      contributedAt: "2026-08-21",
      createdBy: "diana",
      createdAt: "2026-08-21T12:00:00.000Z",
      deletedAt: null,
      member: { id: "diana", displayName: "Diana Vega" },
    };
    const deleted = {
      ...live,
      id: "gc-gone",
      amount: 9000,
      deletedAt: "2026-08-21T18:00:00.000Z",
    };
    const goal: GoalRow = {
      id: "g1",
      householdId: "h1",
      name: "Fondo",
      description: null,
      goalType: "saving",
      targetAmount: 100,
      targetDate: null,
      status: "active",
      createdBy: "diana",
      createdAt: "2026-01-01T00:00:00.000Z",
      contributions: [live, deleted],
    };

    const model = buildDashboardViewModel({
      snapshot: emptySnapshot({
        goals: [goal],
        contributions: [live, deleted],
      }),
      members,
      range,
    });

    assert.equal(model.activeGoals[0].contributed, 40);
    assert.equal(model.activeGoals[0].percent, 40);
    assert.equal(model.activity.some((item) => item.id === "goal_contribution:gc-gone"), false);
    assert.equal(model.activity.some((item) => item.id === "goal_contribution:gc-live"), true);
  });

  it("drops a soft-deleted income from totals, period list, and activity", () => {
    const live: IncomeRow = {
      id: "i-live",
      householdId: "h1",
      memberId: "diana",
      categoryId: "c2",
      amount: 40000,
      description: "Sueldo",
      occurredAt: "2026-08-01",
      recurringId: null,
      createdBy: "diana",
      createdAt: "2026-08-01T12:00:00.000Z",
      deletedAt: null,
      category: { id: "c2", name: "Sueldo", icon: "💰" },
      member: { id: "diana", displayName: "Diana Vega" },
    };
    const deleted: IncomeRow = {
      ...live,
      id: "i-gone",
      amount: 9000,
      deletedAt: "2026-08-21T12:00:00.000Z",
    };

    const model = buildDashboardViewModel({
      snapshot: emptySnapshot({
        incomes: [live, deleted],
        periodIncomes: [live, deleted],
      }),
      members,
      range,
    });

    assert.equal(model.periodIncome, 40000);
    assert.deepEqual(model.periodIncomes.map((row) => row.id), ["i-live"]);
    assert.equal(model.activity.some((item) => item.id === "income:i-gone"), false);
    assert.equal(model.empty.incomes, false);
  });

  it("derives budget spent from live household expenses only", () => {
    const liveExpense: ExpenseRow = {
      id: "e-live",
      householdId: "h1",
      categoryId: "c1",
      amount: 100,
      description: "Luz",
      occurredAt: "2026-08-10",
      payerId: "diana",
      scope: "shared",
      distributionMethod: "equal",
      recurringId: null,
      createdBy: "diana",
      createdAt: "2026-08-10T12:00:00.000Z",
      deletedAt: null,
      category: { id: "c1", name: "Servicios", icon: "💡" },
      payer: null,
      splits: [],
    };
    const deletedExpense: ExpenseRow = {
      ...liveExpense,
      id: "e-del",
      amount: 500,
      deletedAt: "2026-08-11T00:00:00.000Z",
    };
    const otherHousehold: ExpenseRow = {
      ...liveExpense,
      id: "e-other",
      householdId: "h2",
      amount: 500,
    };
    const model = buildDashboardViewModel({
      snapshot: emptySnapshot({
        expenses: [liveExpense],
        periodExpenses: [liveExpense, deletedExpense, otherHousehold],
        recurringExpenses: [
          {
            id: "re1",
            householdId: "h1",
            amount: 999,
            description: "Luz plantilla",
            scope: "shared",
            isActive: true,
            frequency: "monthly",
          },
        ],
        budgets: [
          {
            id: "b-live",
            householdId: "h1",
            memberId: null,
            categoryId: "c1",
            amount: 400,
            period: "monthly",
            startDate: "2026-08-01",
            endDate: "2026-08-31",
            createdBy: "diana",
            createdAt: "2026-08-01T12:00:00.000Z",
            deletedAt: null,
            category: { id: "c1", name: "Servicios", icon: "💡" },
          },
          {
            id: "b-del",
            householdId: "h1",
            memberId: null,
            categoryId: "c1",
            amount: 9999,
            period: "monthly",
            startDate: "2026-08-01",
            endDate: "2026-08-31",
            createdBy: "diana",
            createdAt: "2026-08-01T12:00:00.000Z",
            deletedAt: "2026-08-02T00:00:00.000Z",
            category: { id: "c1", name: "Servicios", icon: "💡" },
          },
        ],
      }),
      members,
      range,
    });

    assert.equal(model.budget.totalBudget, 400);
    assert.equal(model.periodBudgets.length, 1);
    assert.equal(model.periodBudgets[0].spent, 100);
    assert.equal(model.periodBudgets[0].remaining, 300);
    assert.equal(model.periodSpent, 100);
    if (model.health.available) {
      assert.equal(model.health.budgetUsagePercent, 25);
    }
  });
});
