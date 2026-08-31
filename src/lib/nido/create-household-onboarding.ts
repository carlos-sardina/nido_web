import { nidoErrorFromUnknown, nidoFail, nidoOk, type NidoResult } from "./errors.ts";
import { normalizeHouseholdName } from "./rules.ts";
import { isHouseholdSplitMethod, type HouseholdSplitMethod } from "./split-method.ts";
import type { Household } from "./types.ts";
import { MAX_MONEY_AMOUNT, roundMoney } from "./financial/money.ts";
import type { OnboardingEstimatePlan } from "../onboarding/financial-plan.ts";
import { canStartExclusiveAction } from "../onboarding/validation.ts";

export type CreateHouseholdOnboardingRequest = {
  name: string;
  incomeAmount: number;
  splitMethod?: HouseholdSplitMethod;
  savingsPersonal?: number | null;
  savingsShared?: number | null;
  estimates?: readonly OnboardingEstimatePlan[];
};

export type CreateHouseholdOnboardingAuth = {
  getUserId: () => Promise<string | null>;
  rpc: (
    fn: "create_household_with_onboarding_income",
    args: Record<string, unknown>,
  ) => Promise<{ data: Household | null; error: unknown }>;
};

function optionalStockAmount(
  value: number | null | undefined,
): { ok: true; amount: number | null } | { ok: false } {
  if (value == null) return { ok: true, amount: null };
  const amount = roundMoney(value);
  if (!Number.isFinite(amount) || amount < 0 || amount > MAX_MONEY_AMOUNT) {
    return { ok: false };
  }
  return { ok: true, amount };
}

function estimatePayload(
  estimates: readonly OnboardingEstimatePlan[] | undefined,
): OnboardingEstimatePlan[] | { error: true } {
  if (!estimates?.length) return [];
  const rows: OnboardingEstimatePlan[] = [];
  for (const estimate of estimates) {
    const amount = roundMoney(estimate.amount);
    if (!Number.isFinite(amount) || amount < 0 || amount > MAX_MONEY_AMOUNT) {
      return { error: true };
    }
    if (estimate.type !== "personal" && estimate.type !== "shared") {
      return { error: true };
    }
    const name = estimate.name.trim();
    if (!name) return { error: true };
    rows.push({
      name,
      icon: estimate.icon.trim() || "💳",
      type: estimate.type,
      amount,
    });
  }
  return rows;
}

/**
 * Domain mutation used by createHouseholdFromOnboarding().
 *
 * The RPC creates the household, owner membership, default income
 * catalog, split preference, optional savings stock, categories and
 * initial budgets from estimates, and the onboarding income in one
 * transaction. Amount-zero estimates persist the category only. Unused
 * default expense categories are archived. The client never sends
 * household_id, created_by, member_id, category_id, or a date.
 */
export async function createHouseholdFromOnboardingWithAuth(
  input: CreateHouseholdOnboardingRequest,
  auth: CreateHouseholdOnboardingAuth,
): Promise<NidoResult<Household>> {
  const userId = await auth.getUserId();
  if (!userId) return nidoFail("unauthenticated");

  const name = normalizeHouseholdName(input.name);
  if (!name) return nidoFail("invalid_name");

  const amount = roundMoney(input.incomeAmount);
  if (!Number.isFinite(amount) || amount < 0 || amount > MAX_MONEY_AMOUNT) {
    return nidoFail("invalid_amount");
  }

  const splitMethod = input.splitMethod ?? "equal";
  if (!isHouseholdSplitMethod(splitMethod)) {
    return nidoFail("invalid_split");
  }

  const savingsPersonal = optionalStockAmount(input.savingsPersonal);
  if (savingsPersonal.ok === false) return nidoFail("invalid_amount");
  const savingsShared = optionalStockAmount(input.savingsShared);
  if (savingsShared.ok === false) return nidoFail("invalid_amount");

  const estimates = estimatePayload(input.estimates);
  if ("error" in estimates) return nidoFail("invalid_amount");

  const { data, error } = await auth.rpc("create_household_with_onboarding_income", {
    p_name: name,
    p_income_amount: amount,
    p_split_method: splitMethod,
    p_savings_personal: savingsPersonal.amount,
    p_savings_shared: savingsShared.amount,
    p_estimates: estimates,
  });

  if (error) return nidoFail(nidoErrorFromUnknown(error).code);
  if (!data) return nidoFail("network");
  return nidoOk(data);
}

export function canSubmitOnboardingFinalize(submitting: boolean): boolean {
  return canStartExclusiveAction(submitting);
}
