/**
 * Semantic map from the onboarding draft to the live financial model.
 *
 * This is not a second source of truth. It only decides what the finalize
 * RPC may persist. Fields without an equivalent table stay as draft and
 * are discarded when the Nido is created.
 */

import { isSuggestedOnboardingExpenseName } from "../constants.ts";
import type { OData, OnboardingExpense } from "../types.ts";
import { normalizeCategoryName } from "../nido/financial/categories.ts";
import { isHouseholdSplitMethod, type HouseholdSplitMethod } from "../nido/split-method.ts";
import { normalizeHouseholdName } from "../nido/rules.ts";
import { parseMoneyInput, validateOnboardingFinalize } from "./validation.ts";

/** Matches `default_income_category_catalog()`. Documented, not invented silently. */
export const ONBOARDING_INCOME_CATEGORY_NAME = "Sueldo";

/** Field label on the income step. Required by `create_income`. */
export const ONBOARDING_INCOME_DESCRIPTION = "Ingreso mensual neto";

export type SkippedOnboardingField = "income_zero";

export type OnboardingIncomePlan = {
  persist: boolean;
  amount: number | null;
  categoryName: typeof ONBOARDING_INCOME_CATEGORY_NAME;
  description: typeof ONBOARDING_INCOME_DESCRIPTION;
};

export type OnboardingSavingsPlan = {
  persist: boolean;
  amount: number | null;
  scope: "personal" | "shared";
};

export type OnboardingEstimatePlan = {
  name: string;
  icon: string;
  type: "personal" | "shared";
  /** Positive amount writes a budget. Zero keeps the category without a budget. */
  amount: number;
};

export type OnboardingFinancialPlan = {
  householdName: string;
  displayName: string;
  income: OnboardingIncomePlan;
  splitMethod: HouseholdSplitMethod;
  savingsPersonal: OnboardingSavingsPlan;
  savingsShared: OnboardingSavingsPlan;
  estimates: OnboardingEstimatePlan[];
  skipped: SkippedOnboardingField[];
};

export function selectedEstimatedExpenses(data: Pick<OData, "expenses">): OData["expenses"] {
  return data.expenses.filter((expense) => expense.selected && expense.amount.trim());
}

export function hasOptionalSavings(data: Pick<OData, "savings" | "savingsShared">): boolean {
  return Boolean(data.savings.trim() || data.savingsShared.trim());
}

/**
 * Exact onboarding name, trimmed. No alias table.
 * `Renta` stays `Renta`. It does not become `Vivienda`.
 */
export function onboardingEstimateCategoryName(name: string): string | null {
  return normalizeCategoryName(name);
}

export function isCustomOnboardingExpense(
  expense: Pick<OnboardingExpense, "name" | "custom">,
): boolean {
  return expense.custom === true || !isSuggestedOnboardingExpenseName(expense.name);
}

function optionalSavingsPlan(
  raw: string,
  scope: "personal" | "shared",
): { ok: true; plan: OnboardingSavingsPlan } | { ok: false; error: string } {
  if (!raw.trim()) {
    return { ok: true, plan: { persist: false, amount: null, scope } };
  }
  const amount = parseMoneyInput(raw);
  if (amount === null) return { ok: false, error: "Ingresa un monto válido." };
  return { ok: true, plan: { persist: true, amount, scope } };
}

/**
 * Suggested onboarding rows persist only with a positive amount.
 * Custom rows persist even when blank or zero (category only).
 * Same resolved name + type are summed so the RPC writes one live
 * budget per scope/category/month. Amount 0 means category, no budget.
 */
export function buildOnboardingEstimates(
  data: Pick<OData, "expenses">,
): { ok: true; estimates: OnboardingEstimatePlan[] } | { ok: false; error: string } {
  const grouped = new Map<string, OnboardingEstimatePlan>();

  const upsert = (plan: OnboardingEstimatePlan) => {
    const key = `${plan.name.toLowerCase()}|${plan.type}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.amount = Math.round((existing.amount + plan.amount) * 100) / 100;
      return;
    }
    grouped.set(key, plan);
  };

  for (const expense of data.expenses) {
    const custom = isCustomOnboardingExpense(expense);

    if (!custom) {
      if (!expense.selected) continue;
      if (!expense.amount.trim()) continue;
    }

    if (expense.type !== "personal" && expense.type !== "shared") {
      return { ok: false, error: "Elige si el gasto es personal o compartido." };
    }

    const name = onboardingEstimateCategoryName(expense.name);
    if (!name) return { ok: false, error: "Ingresa el nombre del gasto." };

    const icon = expense.icon.trim() || "💳";

    if (!expense.amount.trim()) {
      upsert({ name, icon, type: expense.type, amount: 0 });
      continue;
    }

    const amount = parseMoneyInput(expense.amount);
    if (amount === null) return { ok: false, error: "Ingresa un monto válido." };
    if (amount < 0) return { ok: false, error: "El monto no puede ser negativo." };
    if (amount === 0) {
      if (!custom) continue;
      upsert({ name, icon, type: expense.type, amount: 0 });
      continue;
    }

    upsert({ name, icon, type: expense.type, amount });
  }

  return { ok: true, estimates: [...grouped.values()] };
}

/**
 * Build the persist plan. Required household name, display name, a
 * parseable income amount, and a valid split method must be present.
 * A zero income is valid and does not create an `incomes` row.
 * Savings of zero persist as stock. Blank savings are omitted.
 */
export function planOnboardingFinances(
  data: Pick<OData, "nestName" | "userName" | "salary" | "savings" | "savingsShared" | "expenses" | "contrib">,
): { ok: true; plan: OnboardingFinancialPlan } | { ok: false; error: string } {
  const invalid = validateOnboardingFinalize(data);
  if (invalid) return { ok: false, error: invalid };

  const householdName = normalizeHouseholdName(data.nestName);
  const displayName = data.userName.trim();
  if (!householdName) return { ok: false, error: "Dale un nombre a tu Nido." };
  if (!displayName) return { ok: false, error: "Ingresa el nombre que verán los demás miembros." };

  const amount = parseMoneyInput(data.salary);
  if (amount === null) return { ok: false, error: "Ingresa un monto válido." };

  if (!isHouseholdSplitMethod(data.contrib)) {
    return { ok: false, error: "Elige un método de división válido." };
  }

  const personal = optionalSavingsPlan(data.savings, "personal");
  if (personal.ok === false) return personal;
  const shared = optionalSavingsPlan(data.savingsShared, "shared");
  if (shared.ok === false) return shared;

  const estimates = buildOnboardingEstimates(data);
  if (estimates.ok === false) return estimates;

  const skipped: SkippedOnboardingField[] = [];
  if (amount === 0) skipped.push("income_zero");

  return {
    ok: true,
    plan: {
      householdName,
      displayName,
      income: {
        persist: amount > 0,
        amount,
        categoryName: ONBOARDING_INCOME_CATEGORY_NAME,
        description: ONBOARDING_INCOME_DESCRIPTION,
      },
      splitMethod: data.contrib,
      savingsPersonal: personal.plan,
      savingsShared: shared.plan,
      estimates: estimates.estimates,
      skipped,
    },
  };
}
