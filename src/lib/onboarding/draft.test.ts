import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clearOnboardingDraft,
  draftAfterHouseholdCreateAttempt,
  emptyOnboardingData,
  isOnboardingDraftStep,
  loadOnboardingDraft,
  ONBOARDING_DRAFT_KEY,
  saveOnboardingDraft,
  sanitizeOnboardingData,
} from "./draft.ts";
import { parseMoneyInput, validateIncome } from "./validation.ts";

const memory = new Map<string, string>();

function installSessionStorage() {
  const storage: Storage = {
    get length() {
      return memory.size;
    },
    clear() {
      memory.clear();
    },
    getItem(key) {
      return memory.get(key) ?? null;
    },
    key(index) {
      return [...memory.keys()][index] ?? null;
    },
    removeItem(key) {
      memory.delete(key);
    },
    setItem(key, value) {
      memory.set(key, String(value));
    },
  };
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: storage,
  });
}

describe("onboarding draft", () => {
  it("does not treat auth landing as a draft step", () => {
    assert.equal(isOnboardingDraftStep("welcome"), false);
    assert.equal(isOnboardingDraftStep("auth"), false);
    assert.equal(isOnboardingDraftStep("c-name"), true);
    assert.equal(isOnboardingDraftStep("p-income"), true);
  });

  it("saves and restores a local create-Nido draft", () => {
    installSessionStorage();
    memory.clear();
    const data = emptyOnboardingData();
    data.nestName = "Casa Roma";
    data.userName = "Carlos";
    data.salary = "40000";

    saveOnboardingDraft({ step: "p-income", data, joinCode: "" });
    const restored = loadOnboardingDraft();
    assert.equal(restored?.step, "p-income");
    assert.equal(restored?.data.nestName, "Casa Roma");
    assert.equal(restored?.data.userName, "Carlos");
    assert.equal(restored?.data.salary, "40000");
  });

  it("does not persist auth or welcome screens", () => {
    installSessionStorage();
    memory.clear();
    saveOnboardingDraft({
      step: "welcome",
      data: emptyOnboardingData(),
      joinCode: "",
    });
    assert.equal(loadOnboardingDraft(), null);
    assert.equal(memory.get(ONBOARDING_DRAFT_KEY), undefined);
  });

  it("clears the draft on logout without touching an invitation token", () => {
    installSessionStorage();
    memory.clear();
    sessionStorage.setItem("nido.pendingInvitationToken", "invite-token-value-1");
    saveOnboardingDraft({
      step: "p-savings",
      data: emptyOnboardingData(),
      joinCode: "",
    });
    clearOnboardingDraft();
    assert.equal(loadOnboardingDraft(), null);
    assert.equal(sessionStorage.getItem("nido.pendingInvitationToken"), "invite-token-value-1");
  });

  it("ignores malformed draft JSON", () => {
    installSessionStorage();
    memory.clear();
    sessionStorage.setItem(ONBOARDING_DRAFT_KEY, "{not-json");
    assert.equal(loadOnboardingDraft(), null);
  });

  it("ignores a corrupt draft that contains secrets", () => {
    installSessionStorage();
    memory.clear();
    sessionStorage.setItem(ONBOARDING_DRAFT_KEY, JSON.stringify({
      step: "p-income",
      data: { nestName: "Casa", password: "secret" },
      joinCode: "",
    }));
    assert.equal(loadOnboardingDraft(), null);
  });

  it("does not turn invalid draft amounts into valid numbers", () => {
    const data = sanitizeOnboardingData({
      nestName: "Casa",
      salary: "abc",
      savings: "-10",
      expenses: [{ name: "Renta", amount: "NaN", type: "shared", selected: true }],
    });
    assert.equal(data?.salary, "abc");
    assert.equal(parseMoneyInput(data?.salary ?? ""), null);
    assert.equal(validateIncome(data?.salary ?? ""), "Ingresa un monto válido.");
    assert.equal(data?.savings, "-10");
    assert.equal(data?.expenses[0]?.amount, "NaN");
    assert.equal(parseMoneyInput(data?.expenses[0]?.amount ?? ""), null);
  });

  it("preserves the draft after a failed household create", () => {
    assert.equal(draftAfterHouseholdCreateAttempt(false), "keep");
  });

  it("clears the draft after a successful household create", () => {
    assert.equal(draftAfterHouseholdCreateAttempt(true), "clear");
  });

  it("keeps an abandoned draft so the user can resume", () => {
    installSessionStorage();
    memory.clear();
    const data = emptyOnboardingData();
    data.nestName = "Casa Roma";
    data.salary = "40000";
    saveOnboardingDraft({ step: "p-savings", data, joinCode: "" });
    assert.equal(loadOnboardingDraft()?.step, "p-savings");
    assert.equal(loadOnboardingDraft()?.data.salary, "40000");
  });

  it("does not keep a completed persist as a second source of truth", () => {
    installSessionStorage();
    memory.clear();
    saveOnboardingDraft({
      step: "c-invite",
      data: { ...emptyOnboardingData(), nestName: "Casa", salary: "40000" },
      joinCode: "",
    });
    assert.equal(draftAfterHouseholdCreateAttempt(true), "clear");
    clearOnboardingDraft();
    assert.equal(loadOnboardingDraft(), null);
  });
});
