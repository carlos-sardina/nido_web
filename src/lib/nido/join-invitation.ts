import { isFallbackDisplayName } from "../auth/identity.ts";
import {
  ONBOARDING_INCOME_CATEGORY_NAME,
  ONBOARDING_INCOME_DESCRIPTION,
} from "../onboarding/financial-plan.ts";
import { nidoFail, nidoOk, type NidoResult } from "./errors.ts";
import type { CreateIncomeRequest } from "./financial/income-input.ts";
import { MAX_MONEY_AMOUNT, roundMoney } from "./financial/money.ts";
import { isInvitationTokenFormat, normalizeDisplayName } from "./rules.ts";

export type JoinIncomeCategory = {
  id: string;
  name: string;
};

export type JoinInvitationAuth = {
  getUserId: () => Promise<string | null>;
  getUserEmail: () => Promise<string | null>;
  getProfileDisplayName: () => Promise<NidoResult<string | null>>;
  updateDisplayName: (name: string) => Promise<NidoResult<{ id: string; display_name: string }>>;
  acceptInvitation: (
    token: string,
  ) => Promise<NidoResult<{ householdId: string; householdName: string }>>;
  listIncomeCategories: (
    householdId: string,
  ) => Promise<NidoResult<JoinIncomeCategory[]>>;
  createIncome: (input: CreateIncomeRequest) => Promise<NidoResult<{ id: string }>>;
  todayIso: () => string;
};

export type JoinDisplayNameDecision =
  | { kind: "skip" }
  | { kind: "persist"; displayName: string }
  | { kind: "need_name" };

export type JoinIncomeDecision =
  | { kind: "skip" }
  | { kind: "persist"; amount: number }
  | { kind: "need_income" };

export type CompleteJoinInvitationInput = {
  token: string;
  enteredName?: string | null;
  incomeAmount?: number | null;
};

export function joinDisplayNameDecision(input: {
  enteredName?: string | null;
  currentDisplayName: string | null | undefined;
  email: string | null | undefined;
}): JoinDisplayNameDecision {
  if (
    !isFallbackDisplayName({
      displayName: input.currentDisplayName,
      email: input.email,
    })
  ) {
    return { kind: "skip" };
  }

  const normalized = normalizeDisplayName(input.enteredName);
  if (!normalized) return { kind: "need_name" };
  return { kind: "persist", displayName: normalized };
}

/**
 * Same rule as create-Nido onboarding: a monthly amount is required.
 * `0` is valid and is not persisted. Invalid / missing amounts block join.
 */
export function joinIncomeDecision(
  amount: number | null | undefined,
): JoinIncomeDecision {
  if (amount == null || !Number.isFinite(amount)) return { kind: "need_income" };
  const rounded = roundMoney(amount);
  if (!Number.isFinite(rounded) || rounded < 0 || rounded > MAX_MONEY_AMOUNT) {
    return { kind: "need_income" };
  }
  if (rounded === 0) return { kind: "skip" };
  return { kind: "persist", amount: rounded };
}

export function joinIncomeCategoryId(
  categories: readonly JoinIncomeCategory[],
): string | null {
  const needle = ONBOARDING_INCOME_CATEGORY_NAME.toLowerCase();
  return categories.find((row) => row.name.trim().toLowerCase() === needle)?.id ?? null;
}

async function persistJoinIncome(input: {
  userId: string;
  householdId: string;
  amount: number;
  auth: JoinInvitationAuth;
}): Promise<string | null> {
  const categories = await input.auth.listIncomeCategories(input.householdId);
  if (categories.ok === false) return null;

  const categoryId = joinIncomeCategoryId(categories.data);
  if (!categoryId) return null;

  const created = await input.auth.createIncome({
    householdId: input.householdId,
    categoryId,
    amount: input.amount,
    description: ONBOARDING_INCOME_DESCRIPTION,
    occurredAt: input.auth.todayIso(),
    activeMemberIds: [input.userId],
    allowedCategoryIds: categories.data.map((row) => row.id),
  });
  if (created.ok === false) return null;
  return created.data.id;
}

export async function completeJoinInvitationWithAuth(
  input: CompleteJoinInvitationInput,
  auth: JoinInvitationAuth,
): Promise<
  NidoResult<{
    householdId: string;
    householdName: string;
    persistedDisplayName: string | null;
    persistedIncomeId: string | null;
  }>
> {
  const userId = await auth.getUserId();
  if (!userId) return nidoFail("unauthenticated");

  if (!isInvitationTokenFormat(input.token)) {
    return nidoFail("invitation_invalid");
  }

  const profileName = await auth.getProfileDisplayName();
  if (profileName.ok === false) return profileName;

  const email = await auth.getUserEmail();
  const decision = joinDisplayNameDecision({
    enteredName: input.enteredName,
    currentDisplayName: profileName.data,
    email,
  });

  if (decision.kind === "need_name") {
    return nidoFail("invalid_name", "Ingresa el nombre que verán los demás miembros.");
  }

  const income = joinIncomeDecision(input.incomeAmount);
  if (income.kind === "need_income") {
    return nidoFail("invalid_amount");
  }

  let persistedDisplayName: string | null = null;
  if (decision.kind === "persist") {
    const updated = await auth.updateDisplayName(decision.displayName);
    if (updated.ok === false) return updated;
    persistedDisplayName = updated.data.display_name;
  }

  const accepted = await auth.acceptInvitation(input.token);
  if (accepted.ok === false) return accepted;

  let persistedIncomeId: string | null = null;
  if (income.kind === "persist") {
    persistedIncomeId = await persistJoinIncome({
      userId,
      householdId: accepted.data.householdId,
      amount: income.amount,
      auth,
    });
  }

  return nidoOk({
    householdId: accepted.data.householdId,
    householdName: accepted.data.householdName,
    persistedDisplayName,
    persistedIncomeId,
  });
}
