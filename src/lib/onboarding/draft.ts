/**
 * Temporary onboarding draft. Not a Nido and not an auth session.
 *
 * Stored in sessionStorage so a refresh can restore the current step.
 * Cleared on logout and after the household is created. Never used for
 * access tokens, refresh tokens, or passwords. Unknown or secret-looking
 * keys are dropped on load so corrupt data cannot become a valid draft.
 */

import type { ExpenseKind, Model, OData, OStep, OnboardingExpense } from "../types";

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

const SECRET_KEYS = /password|passwd|secret|token|refresh|access_token|api[_-]?key/i;

export type OnboardingDraft = {
  step: OStep;
  data: OData;
  joinCode: string;
};

export function emptyOnboardingData(): OData {
  return {
    flow: null,
    nestType: "",
    nestName: "",
    userName: "",
    salary: "",
    savings: "",
    savingsShared: "",
    expenses: [],
    contrib: "proportional",
  };
}

export function isOnboardingDraftStep(step: OStep): boolean {
  return DRAFT_STEPS.has(step);
}

function readStorage(): Storage | null {
  if (typeof sessionStorage === "undefined") return null;
  return sessionStorage;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asExpenseType(value: unknown): "personal" | "shared" | null {
  return value === "shared" || value === "personal" ? value : null;
}

function asExpenseKind(value: unknown): ExpenseKind {
  return value === "variable" ? "variable" : "recurring";
}

function asFlow(value: unknown): OData["flow"] {
  return value === "join" || value === "create" ? value : null;
}

function asContrib(value: unknown): Model {
  return value === "equal" || value === "proportional" ? value : "proportional";
}

function objectHasSecretKey(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  return Object.keys(value as object).some((key) => SECRET_KEYS.test(key));
}

function asExpenses(value: unknown): OnboardingExpense[] {
  if (!Array.isArray(value)) return [];
  const expenses: OnboardingExpense[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (objectHasSecretKey(row)) continue;
    if (typeof row.name !== "string") continue;
    const type = asExpenseType(row.type);
    if (!type) continue;
    expenses.push({
      name: row.name,
      icon: typeof row.icon === "string" && row.icon ? row.icon : "💳",
      selected: Boolean(row.selected),
      amount: typeof row.amount === "string" ? row.amount : "",
      type,
      kind: asExpenseKind(row.kind),
    });
  }
  return expenses;
}

export function sanitizeOnboardingData(raw: unknown): OData | null {
  if (!raw || typeof raw !== "object") return null;
  if (objectHasSecretKey(raw)) return null;
  const src = raw as Record<string, unknown>;
  if (typeof src.nestName !== "string") return null;

  return {
    ...emptyOnboardingData(),
    flow: asFlow(src.flow),
    nestType: asString(src.nestType),
    nestName: src.nestName,
    userName: asString(src.userName),
    salary: asString(src.salary),
    savings: asString(src.savings),
    savingsShared: asString(src.savingsShared),
    expenses: asExpenses(src.expenses),
    contrib: asContrib(src.contrib),
    _showAdd: typeof src._showAdd === "boolean" ? src._showAdd : undefined,
    _emoji: typeof src._emoji === "string" ? src._emoji : undefined,
    _cname: typeof src._cname === "string" ? src._cname : undefined,
    _etype: asExpenseType(src._etype) ?? undefined,
  };
}

export function loadOnboardingDraft(): OnboardingDraft | null {
  const storage = readStorage();
  if (!storage) return null;

  try {
    const raw = storage.getItem(ONBOARDING_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    if (objectHasSecretKey(parsed)) return null;

    const record = parsed as Record<string, unknown>;
    if (typeof record.step !== "string" || !isOnboardingDraftStep(record.step as OStep)) {
      return null;
    }
    const data = sanitizeOnboardingData(record.data);
    if (!data) return null;

    return {
      step: record.step as OStep,
      data,
      joinCode: asString(record.joinCode),
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
  const data = sanitizeOnboardingData(draft.data) ?? emptyOnboardingData();
  storage.setItem(ONBOARDING_DRAFT_KEY, JSON.stringify({
    step: draft.step,
    data,
    joinCode: typeof draft.joinCode === "string" ? draft.joinCode : "",
  }));
}

export function clearOnboardingDraft() {
  readStorage()?.removeItem(ONBOARDING_DRAFT_KEY);
}

export function draftAfterHouseholdCreateAttempt(success: boolean): "clear" | "keep" {
  return success ? "clear" : "keep";
}
