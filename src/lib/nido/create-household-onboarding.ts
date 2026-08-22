import { nidoErrorFromUnknown, nidoFail, nidoOk, type NidoResult } from "./errors.ts";
import { normalizeHouseholdName } from "./rules.ts";
import type { Household } from "./types.ts";
import { MAX_MONEY_AMOUNT, roundMoney } from "./financial/money.ts";
import { canStartExclusiveAction } from "../onboarding/validation.ts";

export type CreateHouseholdOnboardingRequest = {
  name: string;
  incomeAmount: number;
};

export type CreateHouseholdOnboardingAuth = {
  getUserId: () => Promise<string | null>;
  rpc: (
    fn: "create_household_with_onboarding_income",
    args: Record<string, unknown>,
  ) => Promise<{ data: Household | null; error: unknown }>;
};

/**
 * Domain mutation used by createHouseholdFromOnboarding().
 *
 * The RPC creates the household, owner membership, default categories,
 * and the onboarding income in one transaction. The client sends only
 * the Nido name and the declared monthly amount. It never sends
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

  const { data, error } = await auth.rpc("create_household_with_onboarding_income", {
    p_name: name,
    p_income_amount: amount,
  });

  if (error) return nidoFail(nidoErrorFromUnknown(error).code);
  if (!data) return nidoFail("network");
  return nidoOk(data);
}

export function canSubmitOnboardingFinalize(submitting: boolean): boolean {
  return canStartExclusiveAction(submitting);
}
