/**
 * Temporary onboarding draft. Not a Nido and not an auth session.
 *
 * Stored in sessionStorage so a refresh can restore the current step.
 * Cleared on logout and after the household is created. Never used for
 * access tokens, refresh tokens, or passwords.
 */

import type { OData, OStep, OnboardingExpense } from "../types";

export const ONBOARDING_DRAFT_KEY = "nido.onboardingDraft";

const DRAFT_STEPS = new Set<OStep>([
  "select",
  "join",
  "c-type",
  "c-name",
  "c-invite",
  "p-name",
  "p-income",
  "p-savings",
  "p-expenses",
  "p-contrib",
]);

export type OnboardingDraft = {
  step: OStep;
  data: OData;
  joinCode: string;
};

export function emptyOnboardingData(): OData {
  return {
    flow: null,
    nestType: "",
    nestEmoji: "🏠",
    nestName: "",
    userName: "",
    salary: "",
    freelance: "",
    savings: "",
    savingsType: "personal",
    savingsShared: "",
    expenses: [],
    contrib: "capacity",
  };
}

export function isOnboardingDraftStep(step: OStep): boolean {
  return DRAFT_STEPS.has(step);
}

function readStorage(): Storage | null {
  if (typeof sessionStorage === "undefined") return null;
  return sessionStorage;
}

function asExpenses(value: unknown): OnboardingExpense[] {
  if (!Array.isArray(value) || value.length === 0) return [];
  return value.map((item) => {
    const row = item as Partial<OnboardingExpense>;
    return {
      name: typeof row.name === "string" ? row.name : "Gasto",
      icon: typeof row.icon === "string" ? row.icon : "💳",
      selected: Boolean(row.selected),
      amount: typeof row.amount === "string" ? row.amount : "",
      type: row.type === "shared" ? "shared" : "personal",
      kind: row.kind === "variable" ? "variable" : "recurring",
    };
  });
}

export function loadOnboardingDraft(): OnboardingDraft | null {
  const storage = readStorage();
  if (!storage) return null;

  try {
    const raw = storage.getItem(ONBOARDING_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OnboardingDraft> & { data?: Partial<OData> };
    if (!parsed.step || !isOnboardingDraftStep(parsed.step) || !parsed.data || typeof parsed.data.nestName !== "string") {
      return null;
    }
    return {
      step: parsed.step,
      data: {
        ...emptyOnboardingData(),
        ...parsed.data,
        expenses: asExpenses(parsed.data.expenses),
      },
      joinCode: typeof parsed.joinCode === "string" ? parsed.joinCode : "",
    };
  } catch {
    return null;
  }
}

export function saveOnboardingDraft(draft: OnboardingDraft) {
  const storage = readStorage();
  if (!storage) return;
  if (!isOnboardingDraftStep(draft.step)) {
    storage.removeItem(ONBOARDING_DRAFT_KEY);
    return;
  }
  storage.setItem(ONBOARDING_DRAFT_KEY, JSON.stringify({
    step: draft.step,
    data: draft.data,
    joinCode: draft.joinCode,
  }));
}

export function clearOnboardingDraft() {
  readStorage()?.removeItem(ONBOARDING_DRAFT_KEY);
}
