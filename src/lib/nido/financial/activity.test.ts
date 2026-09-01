import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildActivityItems, findActivitySource } from "./activity.ts";
import type { ExpenseRow, GoalContributionRow, GoalRow, IncomeRow } from "./types.ts";
import type { HouseholdMemberView } from "../types.ts";

const members: HouseholdMemberView[] = [
  {
    userId: "carlos",
    role: "member",
    joinedAt: "2026-01-01T00:00:00.000Z",
    displayName: "Carlos Pérez",
    avatarUrl: null,
  },
  {
    userId: "diana",
    role: "owner",
    joinedAt: "2026-01-01T00:00:00.000Z",
    displayName: "Diana Vega",
    avatarUrl: null,
  },
];

const expense: ExpenseRow = {
  id: "e1",
  householdId: "h1",
  categoryId: "c1",
  amount: 700,
  description: "Internet",
  occurredAt: "2026-08-21",
  payerId: "carlos",
  scope: "shared",
  distributionMethod: "equal",
  recurringId: "r1",
  createdBy: "carlos",
  createdAt: "2026-08-21T16:00:00.000Z",
  deletedAt: null,
  category: { id: "c1", name: "Internet", icon: "📡" },
  payer: { id: "carlos", displayName: "Carlos Pérez" },
  splits: [],
};

const income: IncomeRow = {
  id: "i1",
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
  category: { id: "c2", name: "Salario", icon: "💼" },
  member: { id: "diana", displayName: "Diana Vega" },
};

const goal: GoalRow = {
  id: "g1",
  householdId: "h1",
  name: "Viaje a Japón",
  description: null,
  goalType: "purchase",
  scope: "shared",
  targetAmount: 80000,
  targetDate: "2027-03-01",
  status: "active",
  createdBy: "diana",
  createdAt: "2026-06-01T00:00:00.000Z",
  contributions: [],
};

const contribution: GoalContributionRow = {
  id: "gc1",
  goalId: "g1",
  memberId: "diana",
  amount: 4000,
  contributedAt: "2026-08-20",
  createdBy: "diana",
  createdAt: "2026-08-20T12:00:00.000Z",
  deletedAt: null,
  member: { id: "diana", displayName: "Diana Vega" },
};

function build(overrides: Partial<Parameters<typeof buildActivityItems>[0]> = {}) {
  return buildActivityItems({
    expenses: [expense],
    incomes: [income],
    contributions: [contribution],
    goals: [goal],
    members,
    householdId: "h1",
    ...overrides,
  });
}

describe("activity transformation", () => {
  it("includes a live expense with payer, category, amount, and scope", () => {
    const items = build({ incomes: [], contributions: [], goals: [] });

    assert.equal(items.length, 1);
    assert.equal(items[0].type, "expense");
    assert.equal(items[0].sourceId, "e1");
    assert.equal(items[0].id, "expense:e1");
    assert.match(items[0].title, /Carlos/);
    assert.match(items[0].title, /Internet/);
    assert.equal(items[0].amount, 700);
    assert.equal(items[0].date, "2026-08-21");
    assert.equal(items[0].memberName, "Carlos Pérez");
    assert.equal(items[0].metadata.categoryName, "Internet");
    assert.equal(items[0].metadata.scope, "shared");
    assert.equal(items[0].metadata.recurring, true);
  });

  it("says everyone paid when the shared expense has no single payer", () => {
    const items = build({
      expenses: [{ ...expense, payerId: null, payer: null }],
      incomes: [],
      contributions: [],
      goals: [],
    });
    assert.equal(items.length, 1);
    assert.equal(items[0].title, "Todos pagaron Internet");
    assert.equal(items[0].memberName, "Todos");
    assert.equal(items[0].memberId, null);
  });

  it("includes a live income with member, category, and amount", () => {
    const items = build({ expenses: [], contributions: [], goals: [] });

    assert.equal(items.length, 1);
    assert.equal(items[0].type, "income");
    assert.equal(items[0].sourceId, "i1");
    assert.match(items[0].title, /Diana/);
    assert.match(items[0].title, /Sueldo/);
    assert.equal(items[0].amount, 40000);
    assert.equal(items[0].metadata.categoryName, "Salario");
    assert.equal(items[0].memberName, "Diana Vega");
  });

  it("includes a live contribution with member, goal, and amount", () => {
    const items = build({ expenses: [], incomes: [] });

    assert.equal(items.length, 1);
    assert.equal(items[0].type, "goal_contribution");
    assert.equal(items[0].sourceId, "gc1");
    assert.match(items[0].title, /Diana/);
    assert.match(items[0].title, /Japón/);
    assert.equal(items[0].amount, 4000);
    assert.equal(items[0].metadata.goalId, "g1");
    assert.equal(items[0].metadata.goalName, "Viaje a Japón");
  });

  it("builds a mixed feed from expenses, incomes, and contributions", () => {
    const items = build();

    assert.equal(items.length, 3);
    assert.deepEqual(
      items.map((item) => item.type),
      ["expense", "goal_contribution", "income"],
    );
    assert.equal(items[0].amount, 700);
    assert.equal(items[1].amount, 4000);
    assert.equal(items[2].amount, 40000);
  });

  it("sorts by occurred/contributed date descending", () => {
    const items = build();
    assert.deepEqual(
      items.map((item) => item.date),
      ["2026-08-21", "2026-08-20", "2026-08-01"],
    );
  });

  it("breaks same-date ties with created_at descending", () => {
    const earlier: ExpenseRow = {
      ...expense,
      id: "e-early",
      description: "Café",
      occurredAt: "2026-08-21",
      createdAt: "2026-08-21T09:00:00.000Z",
    };
    const laterIncome: IncomeRow = {
      ...income,
      id: "i-late",
      description: "Freelance",
      occurredAt: "2026-08-21",
      createdAt: "2026-08-21T18:00:00.000Z",
    };

    const items = build({
      expenses: [earlier, expense],
      incomes: [laterIncome],
      contributions: [],
      goals: [],
    });

    assert.deepEqual(
      items.map((item) => item.sourceId),
      ["i-late", "e1", "e-early"],
    );
  });

  it("keeps distinct types together when they share the same calendar date", () => {
    const sameDayIncome: IncomeRow = {
      ...income,
      id: "i-same",
      occurredAt: "2026-08-21",
      createdAt: "2026-08-21T10:00:00.000Z",
    };
    const sameDayContribution: GoalContributionRow = {
      ...contribution,
      id: "gc-same",
      contributedAt: "2026-08-21",
      createdAt: "2026-08-21T12:00:00.000Z",
    };

    const items = build({
      expenses: [expense],
      incomes: [sameDayIncome],
      contributions: [sameDayContribution],
    });

    assert.deepEqual(
      items.map((item) => item.type),
      ["expense", "goal_contribution", "income"],
    );
    assert.ok(items.every((item) => item.date === "2026-08-21"));
  });

  it("names activity from multiple real members", () => {
    const items = build();
    const carlos = items.find((item) => item.memberId === "carlos");
    const dianaItems = items.filter((item) => item.memberId === "diana");

    assert.ok(carlos);
    assert.match(carlos.title, /Carlos/);
    assert.equal(dianaItems.length, 2);
    assert.ok(dianaItems.every((item) => item.memberName === "Diana Vega"));
  });

  it("excludes soft-deleted expenses from normal activity", () => {
    const items = build({
      expenses: [
        expense,
        { ...expense, id: "e-deleted", deletedAt: "2026-08-21T18:00:00.000Z" },
      ],
      incomes: [],
      contributions: [],
      goals: [],
    });
    assert.equal(items.length, 1);
    assert.equal(items[0].id, "expense:e1");
  });

  it("excludes soft-deleted contributions from normal activity", () => {
    const items = build({
      expenses: [],
      incomes: [],
      contributions: [
        contribution,
        { ...contribution, id: "gc-gone", deletedAt: "2026-08-21T18:00:00.000Z" },
      ],
    });
    assert.equal(items.length, 1);
    assert.equal(items[0].id, "goal_contribution:gc1");
  });

  it("excludes soft-deleted incomes from normal activity", () => {
    const items = build({
      expenses: [],
      incomes: [
        income,
        { ...income, id: "i-deleted", deletedAt: "2026-08-21T18:00:00.000Z" },
      ],
      contributions: [],
      goals: [],
    });
    assert.equal(items.length, 1);
    assert.equal(items[0].id, "income:i1");
  });

  it("excludes activity that belongs to another household", () => {
    const foreignGoal: GoalRow = {
      ...goal,
      id: "g-other",
      householdId: "h2",
      name: "Meta ajena",
    };
    const items = build({
      expenses: [{ ...expense, id: "e-other", householdId: "h2" }],
      incomes: [{ ...income, id: "i-other", householdId: "h2" }],
      contributions: [{ ...contribution, id: "gc-other", goalId: "g-other" }],
      goals: [foreignGoal],
      householdId: "h1",
    });
    assert.deepEqual(items, []);
  });

  it("returns an empty list when the Nido has no activity", () => {
    const items = build({
      expenses: [],
      incomes: [],
      contributions: [],
      goals: [],
    });
    assert.deepEqual(items, []);
  });

  it("does not turn unmaterialized recurrences into activity", () => {
    const items = build({
      expenses: [],
      incomes: [],
      contributions: [],
      goals: [],
    });
    assert.equal(
      items.some((item) => item.id.startsWith("recurring") || item.metadata.recurring === true),
      false,
    );
    assert.deepEqual(items, []);
  });

  it("shows a materialized recurring movement as a normal expense", () => {
    const items = build({
      expenses: [expense],
      incomes: [],
      contributions: [],
      goals: [],
    });
    assert.equal(items.length, 1);
    assert.equal(items[0].type, "expense");
    assert.equal(items[0].metadata.recurring, true);
    assert.equal(items[0].id.startsWith("recurring"), false);
  });

  it("does not duplicate items when the same snapshot is built twice", () => {
    const input = {
      expenses: [expense, expense],
      incomes: [income],
      contributions: [contribution],
      goals: [goal],
      members,
      householdId: "h1" as const,
    };
    const first = buildActivityItems(input);
    const second = buildActivityItems(input);

    assert.equal(first.length, 3);
    assert.deepEqual(
      first.map((item) => item.id),
      second.map((item) => item.id),
    );
    assert.equal(new Set(first.map((item) => item.id)).size, first.length);
  });

  it("sorts newest first and respects the preview limit", () => {
    const items = build({ limit: 1 });
    assert.equal(items.length, 1);
    assert.equal(items[0].id, "expense:e1");
  });

  it("includes a refund as a derived event linked to the original expense", () => {
    const withRefund: ExpenseRow = {
      ...expense,
      refunds: [
        {
          id: "rf1",
          expenseId: "e1",
          amount: 200,
          occurredAt: "2026-08-22",
          createdBy: "carlos",
          createdAt: "2026-08-22T10:00:00.000Z",
          splits: [],
        },
      ],
    };
    const items = build({
      expenses: [withRefund],
      incomes: [],
      contributions: [],
      goals: [],
    });
    assert.equal(items.length, 2);
    const refund = items.find((item) => item.type === "refund");
    assert.ok(refund);
    assert.equal(refund.id, "refund:rf1");
    assert.equal(refund.amount, 200);
    assert.equal(refund.metadata.expenseId, "e1");
    assert.equal(refund.metadata.scope, "shared");
    assert.match(refund.title, /devolución/i);
    assert.match(refund.title, /Internet/);

    const source = findActivitySource(refund, {
      expenses: [withRefund],
      incomes: [],
      goals: [],
    });
    assert.equal(source?.type, "expense");
    if (source?.type === "expense") assert.equal(source.expense.id, "e1");
  });

  it("does not turn a refund of a soft-deleted expense into activity", () => {
    const items = build({
      expenses: [
        {
          ...expense,
          id: "e-deleted",
          deletedAt: "2026-08-21T18:00:00.000Z",
          refunds: [
            {
              id: "rf-gone",
              expenseId: "e-deleted",
              amount: 50,
              occurredAt: "2026-08-22",
              createdBy: "carlos",
              createdAt: "2026-08-22T10:00:00.000Z",
              splits: [],
            },
          ],
        },
      ],
      incomes: [],
      contributions: [],
      goals: [],
    });
    assert.deepEqual(items, []);
  });

  it("resolves activity back to the existing detail sources", () => {
    const items = build();
    const expenseSource = findActivitySource(items[0], {
      expenses: [expense],
      incomes: [income],
      goals: [goal],
    });
    const contributionSource = findActivitySource(items[1], {
      expenses: [expense],
      incomes: [income],
      goals: [goal],
    });
    const incomeSource = findActivitySource(items[2], {
      expenses: [expense],
      incomes: [income],
      goals: [goal],
    });

    assert.equal(expenseSource?.type, "expense");
    if (expenseSource?.type === "expense") assert.equal(expenseSource.expense.id, "e1");
    assert.equal(contributionSource?.type, "goal_contribution");
    if (contributionSource?.type === "goal_contribution") {
      assert.equal(contributionSource.goal.id, "g1");
    }
    assert.equal(incomeSource?.type, "income");
    if (incomeSource?.type === "income") assert.equal(incomeSource.income.id, "i1");
  });
});
