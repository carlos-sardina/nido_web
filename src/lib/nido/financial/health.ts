import { ratioPercent } from "./money.ts";
import type { HealthTone, HealthView } from "./types.ts";

export type HealthInput = {
  incomeThisMonth: number;
  spentThisMonth: number;
  budgetTotal: number;
  activeGoalCount: number;
  emergencyMonths: number | null;
  hasAnyFinancialData: boolean;
};

type ScorePart = {
  earned: number;
  max: number;
};

const SAVINGS_MAX = 58;
const BUDGET_MAX = 18;
const EMERGENCY_MAX = 20;

export function healthLabel(score: number): string {
  if (score >= 80) return "Excelente";
  if (score >= 60) return "Estable";
  if (score >= 40) return "Atención";
  return "Crítico";
}

export function healthTone(score: number): Exclude<HealthTone, "pending"> {
  if (score >= 80) return "excellent";
  if (score >= 60) return "stable";
  if (score >= 40) return "attention";
  return "critical";
}

export function formatHealthMonths(months: number): string {
  const rounded = Math.round(months * 10) / 10;
  return rounded === 1 ? "1 mes" : `${rounded} meses`;
}

function savingsPart(rate: number | null, spentThisMonth: number, incomeThisMonth: number): ScorePart | null {
  if (rate != null) {
    if (rate < 0) {
      return { earned: Math.max(0, Math.round(20 + rate)), max: SAVINGS_MAX };
    }
    const capped = Math.min(rate, 40);
    return { earned: Math.round(24 + (capped / 40) * 34), max: SAVINGS_MAX };
  }
  if (spentThisMonth > 0 && incomeThisMonth <= 0) {
    return { earned: 16, max: SAVINGS_MAX };
  }
  return null;
}

function budgetPart(usage: number | null): ScorePart | null {
  if (usage == null) return null;
  if (usage <= 80) return { earned: 18, max: BUDGET_MAX };
  if (usage <= 100) return { earned: Math.round(18 - ((usage - 80) / 20) * 6), max: BUDGET_MAX };
  if (usage <= 125) return { earned: Math.round(12 - ((usage - 100) / 25) * 12), max: BUDGET_MAX };
  return { earned: 0, max: BUDGET_MAX };
}

function emergencyPart(months: number | null, hasPrimary: boolean): ScorePart | null {
  if (months == null || !hasPrimary) return null;
  return { earned: Math.min(EMERGENCY_MAX, Math.round((months / 6) * EMERGENCY_MAX)), max: EMERGENCY_MAX };
}

function healthTips(input: {
  pending: boolean;
  score: number | null;
  savingsRatePercent: number | null;
  budgetUsagePercent: number | null;
  emergencyMonths: number | null;
  spentThisMonth: number;
  incomeThisMonth: number;
  hasBudget: boolean;
}): string[] {
  const tips: string[] = [];
  const push = (text: string) => {
    if (tips.length < 2) tips.push(text);
  };

  if (input.pending) {
    if (input.incomeThisMonth > 0 && input.spentThisMonth <= 0) {
      push("Aún no hay gastos registrados este mes.");
      push("Cuando registren el primer gasto, veremos cómo va el ahorro.");
    } else {
      push("Registra un gasto para ver cómo va el mes.");
    }
    return tips;
  }

  if (input.savingsRatePercent == null && input.spentThisMonth > 0) {
    push("Hay gastos este mes, pero todavía no hay ingresos registrados.");
    push("Registra los ingresos para ver si el Nido está en equilibrio.");
  }
  if (input.savingsRatePercent != null && input.savingsRatePercent < 0) {
    push("Este mes el Nido gastó más de lo que entró.");
    push("Revisen qué gastos pueden esperar o recortar.");
  }
  if (input.budgetUsagePercent != null && input.budgetUsagePercent > 100) {
    push("El gasto ya rebasó el presupuesto del mes.");
    push("Ajusten el plan o pausen gastos no esenciales.");
  }
  if (input.emergencyMonths != null && input.emergencyMonths < 3) {
    push("El fondo cubre menos de 3 meses.");
    push("Una aportación extra al fondo de respaldo ayuda.");
  }
  if (
    input.budgetUsagePercent != null &&
    input.budgetUsagePercent > 80 &&
    input.budgetUsagePercent <= 100
  ) {
    push("Van cerca del límite del presupuesto.");
  }
  if (
    input.savingsRatePercent != null &&
    input.savingsRatePercent >= 0 &&
    input.savingsRatePercent < 10
  ) {
    push("Este mes quedó poco ahorro.");
  }

  if (!input.hasBudget && input.spentThisMonth > 0) {
    push("Un presupuesto por categoría ayuda a no pasarse.");
  }
  if (input.emergencyMonths == null && input.spentThisMonth > 0) {
    push("Un fondo de respaldo de 3 meses da más calma.");
  }

  if (tips.length === 0) {
    if (input.score != null && input.score >= 80) {
      push("Sigan así, el Nido va bien este mes.");
    } else if (input.emergencyMonths != null && input.emergencyMonths < 6) {
      push("Va estable. Si pueden, sigan alimentando el fondo de respaldo.");
    } else {
      push("Va estable. Mantengan el ritmo de registro.");
    }
  }

  return tips;
}

function hasAnyMoneySignal(input: HealthInput): boolean {
  return (
    input.incomeThisMonth > 0 ||
    input.spentThisMonth > 0 ||
    input.budgetTotal > 0 ||
    input.emergencyMonths != null
  );
}

function scoredView(input: {
  score: number | null;
  tone: HealthTone;
  label: string;
  tips: string[];
  savingsRatePercent: number | null;
  emergencyMonths: number | null;
  budgetUsagePercent: number | null;
  activeGoalCount: number;
}): HealthView {
  return {
    available: true,
    hint: input.tips[0] ?? null,
    ...input,
  };
}

/**
 * Derived presentation score. Not stored. Only metrics with a real value
 * enter the score; missing budget, fund, or savings do not pull it down.
 * Unavailable when the Nido has nothing to read; pending when data exists
 * but nothing is scoreable yet (for example income without spend).
 */
export function computeHealth(input: HealthInput): HealthView {
  if (!input.hasAnyFinancialData || !hasAnyMoneySignal(input)) {
    return { available: false };
  }

  const monthHasSpend = input.spentThisMonth > 0;

  const savingsRatePercent =
    input.incomeThisMonth > 0 && monthHasSpend
      ? ratioPercent(input.incomeThisMonth - input.spentThisMonth, input.incomeThisMonth)
      : null;

  const budgetUsagePercent =
    input.budgetTotal > 0 && monthHasSpend
      ? ratioPercent(input.spentThisMonth, input.budgetTotal)
      : null;

  const savings = savingsPart(savingsRatePercent, input.spentThisMonth, input.incomeThisMonth);
  const budget = budgetPart(budgetUsagePercent);
  const emergency = emergencyPart(input.emergencyMonths, savings != null || budget != null);
  const parts = [savings, budget, emergency].filter((part): part is ScorePart => part != null);

  const metrics = {
    savingsRatePercent,
    emergencyMonths: input.emergencyMonths,
    budgetUsagePercent,
    activeGoalCount: input.activeGoalCount,
  };

  const tipInput = {
    savingsRatePercent,
    budgetUsagePercent,
    emergencyMonths: input.emergencyMonths,
    spentThisMonth: input.spentThisMonth,
    incomeThisMonth: input.incomeThisMonth,
    hasBudget: input.budgetTotal > 0,
  };

  if (parts.length === 0) {
    return scoredView({
      score: null,
      tone: "pending",
      label: "En curso",
      tips: healthTips({ ...tipInput, pending: true, score: null }),
      ...metrics,
    });
  }

  const earned = parts.reduce((sum, part) => sum + part.earned, 0);
  const max = parts.reduce((sum, part) => sum + part.max, 0);
  const score = Math.min(100, Math.max(0, Math.round((earned / max) * 100)));

  return scoredView({
    score,
    tone: healthTone(score),
    label: healthLabel(score),
    tips: healthTips({
      ...tipInput,
      pending: false,
      score,
      emergencyMonths: emergency != null ? input.emergencyMonths : null,
    }),
    ...metrics,
  });
}
