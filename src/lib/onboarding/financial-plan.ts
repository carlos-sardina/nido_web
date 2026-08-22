/**
 * Semantic map from the onboarding draft to the live financial model.
 *
 * This is not a second source of truth. It only decides what the finalize
 * RPC may persist. Fields without an equivalent table stay as draft and
 * are discarded when the Nido is created.
 */

import type { OData } from "../types.ts";
import { normalizeHouseholdName } from "../nido/rules.ts";
import { parseMoneyInput, validateOnboardingFinalize } from "./validation.ts";

/** Matches `default_income_category_catalog()`. Documented, not invented silently. */
export const ONBOARDING_INCOME_CATEGORY_NAME = "Sueldo";

/** Field label on the income step. Required by `create_income`. */
export const ONBOARDING_INCOME_DESCRIPTION = "Ingreso mensual neto";

export type SkippedOnboardingField =
  | "freelance"
  | "savings_personal"
  | "savings_shared"
  | "estimated_expenses"
  | "division_method"
  | "income_zero";

export type OnboardingIncomePlan = {
  persist: boolean;
  amount: number | null;
  categoryName: typeof ONBOARDING_INCOME_CATEGORY_NAME;
  description: typeof ONBOARDING_INCOME_DESCRIPTION;
};

export type OnboardingFinancialPlan = {
  householdName: string;
  displayName: string;
  income: OnboardingIncomePlan;
  skipped: SkippedOnboardingField[];
};

export function selectedEstimatedExpenses(data: Pick<OData, "expenses">): OData["expenses"] {
  return data.expenses.filter((expense) => expense.selected && expense.amount.trim());
}

export function hasOptionalSavings(data: Pick<OData, "savings" | "savingsShared">): boolean {
  return Boolean(data.savings.trim() || data.savingsShared.trim());
}

/**
 * Build the persist plan. Required household name, display name, and a
 * parseable income amount must be present. A zero income is valid and
 * does not create an `incomes` row.
 */
export function planOnboardingFinances(
  data: Pick<OData, "nestName" | "userName" | "salary" | "freelance" | "savings" | "savingsShared" | "expenses" | "contrib">,
): { ok: true; plan: OnboardingFinancialPlan } | { ok: false; error: string } {
  const invalid = validateOnboardingFinalize(data);
  if (invalid) return { ok: false, error: invalid };

  const householdName = normalizeHouseholdName(data.nestName);
  const displayName = data.userName.trim();
  if (!householdName) return { ok: false, error: "Dale un nombre a tu Nido." };
  if (!displayName) return { ok: false, error: "Ingresa el nombre que verán los demás miembros." };

  const amount = parseMoneyInput(data.salary);
  if (amount === null) return { ok: false, error: "Ingresa un monto válido." };

  const skipped: SkippedOnboardingField[] = [];
  if (data.freelance.trim()) skipped.push("freelance");
  if (data.savings.trim()) skipped.push("savings_personal");
  if (data.savingsShared.trim()) skipped.push("savings_shared");
  if (selectedEstimatedExpenses(data).length > 0) skipped.push("estimated_expenses");
  if (data.contrib) skipped.push("division_method");
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
      skipped,
    },
  };
}
