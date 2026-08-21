import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeHealth } from "./health.ts";

describe("financial health", () => {
  it("is unavailable when the Nido has no financial records", () => {
    const health = computeHealth({
      incomeThisMonth: 0,
      spentThisMonth: 0,
      budgetTotal: 0,
      activeGoalCount: 0,
      emergencyMonths: null,
      hasAnyFinancialData: false,
    });
    assert.equal(health.available, false);
  });

  it("does not invent a savings rate without income", () => {
    const health = computeHealth({
      incomeThisMonth: 0,
      spentThisMonth: 700,
      budgetTotal: 0,
      activeGoalCount: 1,
      emergencyMonths: null,
      hasAnyFinancialData: true,
    });
    assert.equal(health.available, true);
    if (health.available) {
      assert.equal(health.savingsRatePercent, null);
      assert.equal(health.label.length > 0, true);
      assert.equal(health.score >= 0 && health.score <= 100, true);
    }
  });

  it("computes a savings rate from real income and spending", () => {
    const health = computeHealth({
      incomeThisMonth: 100000,
      spentThisMonth: 82000,
      budgetTotal: 80000,
      activeGoalCount: 2,
      emergencyMonths: 4.2,
      hasAnyFinancialData: true,
    });
    assert.equal(health.available, true);
    if (health.available) {
      assert.equal(health.savingsRatePercent, 18);
      assert.equal(health.budgetUsagePercent, 103);
      assert.equal(health.activeGoalCount, 2);
    }
  });
});
