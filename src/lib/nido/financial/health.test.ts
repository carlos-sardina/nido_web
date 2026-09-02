import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeHealth, formatHealthMonths, healthLabel, healthTone } from "./health.ts";

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

  it("is unavailable when the only signal is an active goal", () => {
    const health = computeHealth({
      incomeThisMonth: 0,
      spentThisMonth: 0,
      budgetTotal: 0,
      activeGoalCount: 1,
      emergencyMonths: null,
      hasAnyFinancialData: true,
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
      assert.equal(health.tone, "critical");
      assert.equal(health.score != null && health.score < 40, true);
      assert.equal(health.hint?.includes("ingresos"), true);
      assert.equal(health.tips[0]?.includes("ingresos"), true);
      assert.equal(health.tips.length, 2);
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
      assert.equal(health.emergencyMonths, 4.2);
      assert.equal(health.label, "Estable");
      assert.equal(health.tone, "stable");
      assert.equal(health.hint, "El gasto ya rebasó el presupuesto del mes.");
      assert.deepEqual(health.tips, [
        "El gasto ya rebasó el presupuesto del mes.",
        "Ajusten el plan o pausen gastos no esenciales.",
      ]);
    }
  });

  it("does not call a deficit Estable just because there are goals and a fund", () => {
    const health = computeHealth({
      incomeThisMonth: 100000,
      spentThisMonth: 115000,
      budgetTotal: 90000,
      activeGoalCount: 2,
      emergencyMonths: 3,
      hasAnyFinancialData: true,
    });
    assert.equal(health.available, true);
    if (health.available) {
      assert.equal(health.savingsRatePercent, -15);
      assert.equal(health.score < 60, true);
      assert.equal(health.hint, "Este mes el Nido gastó más de lo que entró.");
      assert.deepEqual(health.tips, [
        "Este mes el Nido gastó más de lo que entró.",
        "Revisen qué gastos pueden esperar o recortar.",
      ]);
    }
  });

  it("does not look healthy when there is spending and no income", () => {
    const health = computeHealth({
      incomeThisMonth: 0,
      spentThisMonth: 8000,
      budgetTotal: 10000,
      activeGoalCount: 1,
      emergencyMonths: null,
      hasAnyFinancialData: true,
    });
    assert.equal(health.available, true);
    if (health.available) {
      assert.equal(health.score < 60, true);
      assert.equal(health.tone === "attention" || health.tone === "critical", true);
    }
  });

  it("reaches Excelente with a strong surplus, plan, and buffer", () => {
    const health = computeHealth({
      incomeThisMonth: 100000,
      spentThisMonth: 55000,
      budgetTotal: 80000,
      activeGoalCount: 1,
      emergencyMonths: 6,
      hasAnyFinancialData: true,
    });
    assert.equal(health.available, true);
    if (health.available) {
      assert.equal(health.savingsRatePercent, 45);
      assert.equal(health.label, "Excelente");
      assert.equal(health.tone, "excellent");
      assert.deepEqual(health.tips, ["Sigan así, el Nido va bien este mes."]);
    }
  });

  it("does not treat income with no spending as a 100% savings rate", () => {
    const health = computeHealth({
      incomeThisMonth: 40000,
      spentThisMonth: 0,
      budgetTotal: 0,
      activeGoalCount: 1,
      emergencyMonths: null,
      hasAnyFinancialData: true,
    });
    assert.equal(health.available, true);
    if (health.available) {
      assert.equal(health.savingsRatePercent, null);
      assert.equal(health.budgetUsagePercent, null);
      assert.equal(health.score, null);
      assert.equal(health.tone, "pending");
      assert.equal(health.label, "En curso");
      assert.deepEqual(health.tips, [
        "Aún no hay gastos registrados este mes.",
        "Cuando registren el primer gasto, veremos cómo va el ahorro.",
      ]);
    }
  });

  it("does not lower the score when budget or backup fund are still missing", () => {
    const health = computeHealth({
      incomeThisMonth: 100000,
      spentThisMonth: 80000,
      budgetTotal: 0,
      activeGoalCount: 0,
      emergencyMonths: null,
      hasAnyFinancialData: true,
    });
    assert.equal(health.available, true);
    if (health.available) {
      assert.equal(health.savingsRatePercent, 20);
      assert.equal(health.budgetUsagePercent, null);
      assert.equal(health.label, "Estable");
      assert.equal(health.tone, "stable");
      assert.deepEqual(health.tips, [
        "Un presupuesto por categoría ayuda a no pasarse.",
        "Un fondo de respaldo de 3 meses da más calma.",
      ]);
    }
  });

  it("stays pending after a budget exists if the month still has no spend", () => {
    const health = computeHealth({
      incomeThisMonth: 40000,
      spentThisMonth: 0,
      budgetTotal: 12000,
      activeGoalCount: 0,
      emergencyMonths: 4,
      hasAnyFinancialData: true,
    });
    assert.equal(health.available, true);
    if (health.available) {
      assert.equal(health.tone, "pending");
      assert.equal(health.score, null);
      assert.equal(health.budgetUsagePercent, null);
    }
  });

  it("scales emergency coverage instead of a cliff at 3 months", () => {
    const thin = computeHealth({
      incomeThisMonth: 100000,
      spentThisMonth: 80000,
      budgetTotal: 80000,
      activeGoalCount: 0,
      emergencyMonths: 1,
      hasAnyFinancialData: true,
    });
    const full = computeHealth({
      incomeThisMonth: 100000,
      spentThisMonth: 80000,
      budgetTotal: 80000,
      activeGoalCount: 0,
      emergencyMonths: 6,
      hasAnyFinancialData: true,
    });
    assert.equal(thin.available && full.available, true);
    if (thin.available && full.available) {
      assert.equal(full.score > thin.score, true);
      assert.deepEqual(thin.tips, [
        "El fondo cubre menos de 3 meses.",
        "Una aportación extra al fondo de respaldo ayuda.",
      ]);
    }
  });
});

describe("health labels", () => {
  it("maps score bands", () => {
    assert.equal(healthLabel(80), "Excelente");
    assert.equal(healthTone(80), "excellent");
    assert.equal(healthLabel(60), "Estable");
    assert.equal(healthTone(59), "attention");
    assert.equal(healthLabel(39), "Crítico");
    assert.equal(healthTone(0), "critical");
  });

  it("uses singular mes only for exactly one month", () => {
    assert.equal(formatHealthMonths(1), "1 mes");
    assert.equal(formatHealthMonths(1.0), "1 mes");
    assert.equal(formatHealthMonths(1.5), "1.5 meses");
    assert.equal(formatHealthMonths(4.2), "4.2 meses");
  });
});
