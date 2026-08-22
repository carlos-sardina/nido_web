import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  activeGoalProgress,
  canMutateGoal,
  emergencyMonthsCovered,
  featuredSavingGoal,
  formatGoalTargetDate,
  goalProgress,
} from "./goals.ts";
import type { GoalContributionRow, GoalRow } from "./types.ts";

function contribution(
  partial: Partial<GoalContributionRow> & Pick<GoalContributionRow, "amount">,
): GoalContributionRow {
  return {
    id: partial.id ?? "c1",
    goalId: partial.goalId ?? "g1",
    memberId: "u1",
    contributedAt: "2026-08-01",
    createdBy: "u1",
    createdAt: "2026-08-01T12:00:00.000Z",
    member: null,
    ...partial,
  };
}

function goal(partial: Partial<GoalRow> & Pick<GoalRow, "name" | "targetAmount">): GoalRow {
  return {
    id: partial.id ?? "g1",
    householdId: "h1",
    description: null,
    goalType: "saving",
    targetDate: null,
    status: "active",
    createdBy: "u1",
    createdAt: "2026-08-01T12:00:00.000Z",
    contributions: [],
    ...partial,
  };
}

describe("goal progress", () => {
  it("is zero when there are no contributions", () => {
    const progress = goalProgress(goal({ name: "Japón", targetAmount: 80000 }));
    assert.equal(progress.contributed, 0);
    assert.equal(progress.percent, 0);
    assert.equal(progress.completed, false);
    assert.equal(progress.invalidTarget, false);
  });

  it("derives progress from contributions, not a stored current_amount", () => {
    const progress = goalProgress(
      goal({
        name: "Japón",
        targetAmount: 80000,
        contributions: [contribution({ amount: 20000 }), contribution({ id: "c2", amount: 8000 })],
      }),
    );
    assert.equal(progress.contributed, 28000);
    assert.equal(progress.percent, 35);
    assert.equal(progress.completed, false);
  });

  it("marks a goal completed when contributions reach the target", () => {
    const progress = goalProgress(
      goal({
        name: "Fondo",
        targetAmount: 100,
        contributions: [contribution({ amount: 100 })],
      }),
    );
    assert.equal(progress.completed, true);
    assert.equal(progress.percent, 100);
  });

  it("does not divide by an invalid target", () => {
    const progress = goalProgress(
      goal({
        name: "Rota",
        targetAmount: 0,
        contributions: [contribution({ amount: 50 })],
      }),
    );
    assert.equal(progress.invalidTarget, true);
    assert.equal(progress.percent, 0);
    assert.equal(progress.ratio, 0);
    assert.equal(Number.isFinite(progress.percent), true);
  });

  it("caps overflow contributions at 100%", () => {
    const progress = goalProgress(
      goal({
        name: "Casa",
        targetAmount: 100,
        contributions: [contribution({ amount: 150 })],
      }),
    );
    assert.equal(progress.percent, 100);
    assert.equal(progress.contributed, 150);
    assert.equal(progress.completed, true);
  });
});

describe("goal authorization helper", () => {
  it("allows only the creator of an active goal", () => {
    const live = goal({ name: "Fondo", targetAmount: 100, createdBy: "carlos" });
    assert.equal(canMutateGoal(live, "carlos"), true);
    assert.equal(canMutateGoal(live, "diana"), false);
    assert.equal(canMutateGoal(live, null), false);
  });

  it("rejects an archived goal even for the creator", () => {
    const archived = goal({
      name: "Vieja",
      targetAmount: 100,
      createdBy: "carlos",
      status: "archived",
    });
    assert.equal(canMutateGoal(archived, "carlos"), false);
  });
});

describe("goal target date label", () => {
  it("formats a calendar date without using a stored current_amount", () => {
    assert.equal(formatGoalTargetDate(null), null);
    const label = formatGoalTargetDate("2027-03-01");
    assert.ok(label);
    assert.match(label ?? "", /2027/);
  });
});

describe("featured saving goal", () => {
  it("prefers an emergency-named active goal", () => {
    const featured = featuredSavingGoal([
      goal({ id: "g2", name: "Viaje", targetAmount: 10, goalType: "purchase" }),
      goal({ id: "g3", name: "Fondo de emergencia", targetAmount: 200, contributions: [contribution({ amount: 120 })] }),
    ]);
    assert.equal(featured?.id, "g3");
    assert.equal(featured?.contributed, 120);
  });

  it("ignores archived goals in the active list", () => {
    const active = activeGoalProgress([
      goal({ name: "Vieja", targetAmount: 10, status: "archived" }),
      goal({ id: "g2", name: "Nueva", targetAmount: 10 }),
    ]);
    assert.equal(active.length, 1);
    assert.equal(active[0].id, "g2");
  });
});

describe("emergency months", () => {
  it("returns null when monthly spend is zero", () => {
    assert.equal(emergencyMonthsCovered(120000, 0), null);
  });

  it("divides the contributed amount by this month's spend", () => {
    assert.equal(emergencyMonthsCovered(120000, 30000), 4);
  });
});
