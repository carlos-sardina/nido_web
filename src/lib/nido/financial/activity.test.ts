import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildActivityItems } from "./activity.ts";
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
  member: { id: "diana", displayName: "Diana Vega" },
};

describe("activity transformation", () => {
  it("builds a common visual model from expenses, incomes, and contributions", () => {
    const items = buildActivityItems({
      expenses: [expense],
      incomes: [income],
      contributions: [contribution],
      goals: [goal],
      members,
    });

    assert.equal(items.length, 3);
    assert.equal(items[0].type, "expense");
    assert.match(items[0].title, /Carlos/);
    assert.match(items[0].title, /Internet/);
    assert.equal(items[0].amount, 700);
    assert.equal(items[0].metadata.recurring, true);
    assert.equal(items[0].metadata.scope, "shared");

    const contrib = items.find((item) => item.type === "goal_contribution");
    assert.ok(contrib);
    assert.match(contrib.title, /Japón/);
    assert.equal(contrib.amount, 4000);

    const incomeItem = items.find((item) => item.type === "income");
    assert.ok(incomeItem);
    assert.equal(incomeItem.metadata.recurring, false);
  });

  it("sorts newest first and respects the preview limit", () => {
    const items = buildActivityItems({
      expenses: [expense],
      incomes: [income],
      contributions: [contribution],
      goals: [goal],
      members,
      limit: 1,
    });
    assert.equal(items.length, 1);
    assert.equal(items[0].id, "expense:e1");
  });

  it("returns an empty list when there is no activity", () => {
    const items = buildActivityItems({
      expenses: [],
      incomes: [],
      contributions: [],
      goals: [],
      members,
    });
    assert.deepEqual(items, []);
  });
});
