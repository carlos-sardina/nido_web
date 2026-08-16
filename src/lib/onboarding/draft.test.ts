import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clearOnboardingDraft,
  emptyOnboardingData,
  isOnboardingDraftStep,
  loadOnboardingDraft,
  ONBOARDING_DRAFT_KEY,
  saveOnboardingDraft,
} from "./draft.ts";

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

  it("clears the draft without touching an invitation token", () => {
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
});
