import {
  createHouseholdFromOnboardingWithAuth,
  type CreateHouseholdOnboardingRequest,
} from "./create-household-onboarding.ts";
import { nidoErrorFromUnknown, nidoFail, nidoOk, type NidoResult } from "./errors";
import { normalizeHouseholdName } from "./rules";
import { nidoClient, requireUser, type NidoClient } from "./session";
import type { Household } from "./types";
import {
  canSubmitHouseholdName,
  updateHouseholdNameWithAuth,
} from "./update-household-name.ts";
import {
  canSubmitHouseholdSplitMethod,
  updateHouseholdSplitMethodWithAuth,
} from "./update-household-split-method.ts";
import type { HouseholdSplitMethod } from "./split-method.ts";

export type { CreateHouseholdOnboardingRequest };
export { canSubmitHouseholdName, canSubmitHouseholdSplitMethod };

export async function createHousehold(
  input: { name: string },
  supabase: NidoClient = nidoClient(),
): Promise<NidoResult<Household>> {
  const auth = await requireUser(supabase);
  if (auth.ok === false) return nidoFail(auth.error.code);

  const name = normalizeHouseholdName(input.name);
  if (!name) return nidoFail("invalid_name");

  const { data, error } = await auth.data.supabase.rpc("create_household", {
    p_name: name,
  });

  if (error) return nidoFail(nidoErrorFromUnknown(error).code);
  if (!data) return nidoFail("network");
  return nidoOk(data);
}

export async function createHouseholdFromOnboarding(
  input: CreateHouseholdOnboardingRequest,
  supabase: NidoClient = nidoClient(),
): Promise<NidoResult<Household>> {
  const auth = await requireUser(supabase);
  if (auth.ok === false) return nidoFail(auth.error.code);

  return createHouseholdFromOnboardingWithAuth(input, {
    getUserId: async () => auth.data.user.id,
    rpc: async (fn, args) => auth.data.supabase.rpc(fn, args as never),
  });
}

export async function updateHouseholdName(
  name: string,
  supabase: NidoClient = nidoClient(),
): Promise<NidoResult<Household>> {
  const auth = await requireUser(supabase);
  if (auth.ok === false) return nidoFail(auth.error.code);

  return updateHouseholdNameWithAuth(name, {
    getUserId: async () => auth.data.user.id,
    rpc: async (fn, args) => auth.data.supabase.rpc(fn, args),
  });
}

export async function updateHouseholdSplitMethod(
  method: HouseholdSplitMethod,
  supabase: NidoClient = nidoClient(),
): Promise<NidoResult<Household>> {
  const auth = await requireUser(supabase);
  if (auth.ok === false) return nidoFail(auth.error.code);

  return updateHouseholdSplitMethodWithAuth(method, {
    getUserId: async () => auth.data.user.id,
    rpc: async (fn, args) => auth.data.supabase.rpc(fn, args),
  });
}
