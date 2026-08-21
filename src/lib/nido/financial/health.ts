import { clampedPercent, ratioPercent } from "./money.ts";
import type { HealthView } from "./types.ts";

export type HealthInput = {
  incomeThisMonth: number;
  spentThisMonth: number;
  budgetTotal: number;
  activeGoalCount: number;
  emergencyMonths: number | null;
  hasAnyFinancialData: boolean;
};

export function healthLabel(score: number): string {
  if (score >= 80) return "Excelente";
  if (score >= 60) return "Estable";
  if (score >= 40) return "Atención";
  return "Crítico";
}

/**
 * Derived presentation score. Not stored. Returns unavailable when the Nido
 * has no incomes, expenses, budgets, or goals so the UI can show an empty
 * state instead of a fake 92.
 */
export function computeHealth(input: HealthInput): HealthView {
  if (!input.hasAnyFinancialData) {
    return { available: false };
  }

  const savingsRatePercent =
    input.incomeThisMonth > 0
      ? ratioPercent(input.incomeThisMonth - input.spentThisMonth, input.incomeThisMonth)
      : null;

  const budgetUsagePercent =
    input.budgetTotal > 0 ? ratioPercent(input.spentThisMonth, input.budgetTotal) : null;

  let score = 45;

  if (savingsRatePercent != null) {
    if (savingsRatePercent < 0) {
      score = 28;
    } else {
      score = 40 + clampedPercent(Math.min(savingsRatePercent, 40), 40) * 0.5;
    }
  }

  if (budgetUsagePercent != null) {
    if (budgetUsagePercent <= 100) score += 10;
    else if (budgetUsagePercent > 110) score -= 10;
  }

  if (input.activeGoalCount > 0) score += 10;
  if (input.emergencyMonths != null && input.emergencyMonths >= 3) score += 10;

  const rounded = Math.min(100, Math.max(0, Math.round(score)));

  return {
    available: true,
    score: rounded,
    label: healthLabel(rounded),
    savingsRatePercent,
    emergencyMonths: input.emergencyMonths,
    budgetUsagePercent,
    activeGoalCount: input.activeGoalCount,
  };
}
