import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EMAIL_COOLDOWN_SECONDS,
  EMAIL_COOLDOWN_STORAGE_KEY,
  canAttemptEmailSend,
  clearCooldown,
  emailCooldownCountdownLabel,
  emailCooldownRetryHint,
  getRemainingCooldown,
  isCoolingDown,
  readEmailCooldownStorage,
  shouldStartEmailCooldown,
  startCooldown,
} from "./email-cooldown.ts";
import { interpretResendResponse, isTechnicalAuthLeak } from "./errors.ts";

const memory = new Map<string, string>();

function installSessionStorage() {
  memory.clear();
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

function storedRaw(): string {
  return sessionStorage.getItem(EMAIL_COOLDOWN_STORAGE_KEY) ?? "";
}

describe("email cooldown", () => {
  it("starts at 0 before any send", () => {
    installSessionStorage();
    assert.equal(getRemainingCooldown("confirmation", "alex@example.com", 1_000), 0);
    assert.equal(isCoolingDown("confirmation", "alex@example.com", 1_000), false);
    assert.equal(canAttemptEmailSend("confirmation", "alex@example.com", { inFlight: false, now: 1_000 }), true);
  });

  it("startCooldown lasts 60 seconds", () => {
    installSessionStorage();
    const sentAt = 10_000;
    startCooldown("confirmation", "alex@example.com", sentAt);
    assert.equal(getRemainingCooldown("confirmation", "alex@example.com", sentAt), EMAIL_COOLDOWN_SECONDS);
    assert.equal(isCoolingDown("confirmation", "alex@example.com", sentAt), true);
  });

  it("decrements by elapsed whole seconds", () => {
    installSessionStorage();
    const sentAt = 10_000;
    startCooldown("confirmation", "alex@example.com", sentAt);
    assert.equal(getRemainingCooldown("confirmation", "alex@example.com", sentAt + 1_000), 59);
    assert.equal(getRemainingCooldown("confirmation", "alex@example.com", sentAt + 59_000), 1);
  });

  it("expires after 60 seconds", () => {
    installSessionStorage();
    const sentAt = 10_000;
    startCooldown("recovery", "alex@example.com", sentAt);
    assert.equal(getRemainingCooldown("recovery", "alex@example.com", sentAt + 60_000), 0);
    assert.equal(isCoolingDown("recovery", "alex@example.com", sentAt + 60_000), false);
    assert.equal(canAttemptEmailSend("recovery", "alex@example.com", { inFlight: false, now: sentAt + 60_000 }), true);
  });

  it("restores remaining time from sessionStorage after a refresh", () => {
    installSessionStorage();
    const sentAt = 10_000;
    startCooldown("confirmation", "alex@example.com", sentAt);
    const persisted = storedRaw();
    assert.match(persisted, /"action":"confirmation"/);
    assert.match(persisted, /"email":"alex@example.com"/);
    assert.match(persisted, /"sentAt":10000/);

    const remaining = getRemainingCooldown("confirmation", "alex@example.com", sentAt + 20_000);
    assert.equal(remaining, 40);
    assert.deepEqual(readEmailCooldownStorage(sentAt + 20_000), [
      { action: "confirmation", email: "alex@example.com", sentAt },
    ]);
  });

  it("normalizes email before using it as a key", () => {
    installSessionStorage();
    startCooldown("confirmation", "  Alex@Example.COM  ", 10_000);
    assert.equal(isCoolingDown("confirmation", "alex@example.com", 10_000), true);
    assert.equal(isCoolingDown("confirmation", "ALEX@example.com", 10_000), true);
    assert.deepEqual(readEmailCooldownStorage(10_000), [
      { action: "confirmation", email: "alex@example.com", sentAt: 10_000 },
    ]);
  });

  it("keeps independent cooldowns per email", () => {
    installSessionStorage();
    startCooldown("confirmation", "a@example.com", 10_000);
    assert.equal(isCoolingDown("confirmation", "a@example.com", 10_000), true);
    assert.equal(isCoolingDown("confirmation", "b@example.com", 10_000), false);
    assert.equal(canAttemptEmailSend("confirmation", "b@example.com", { inFlight: false, now: 10_000 }), true);
  });

  it("keeps recovery and confirmation cooldowns independent", () => {
    installSessionStorage();
    startCooldown("recovery", "alex@example.com", 10_000);
    assert.equal(isCoolingDown("recovery", "alex@example.com", 10_000), true);
    assert.equal(isCoolingDown("confirmation", "alex@example.com", 10_000), false);
    startCooldown("confirmation", "alex@example.com", 20_000);
    assert.equal(getRemainingCooldown("recovery", "alex@example.com", 20_000), 50);
    assert.equal(getRemainingCooldown("confirmation", "alex@example.com", 20_000), 60);
  });

  it("clearCooldown removes only that action and email", () => {
    installSessionStorage();
    startCooldown("confirmation", "alex@example.com", 10_000);
    startCooldown("recovery", "alex@example.com", 10_000);
    startCooldown("confirmation", "other@example.com", 10_000);
    clearCooldown("confirmation", "alex@example.com", 10_000);
    assert.equal(isCoolingDown("confirmation", "alex@example.com", 10_000), false);
    assert.equal(isCoolingDown("recovery", "alex@example.com", 10_000), true);
    assert.equal(isCoolingDown("confirmation", "other@example.com", 10_000), true);
  });

  it("blocks a second attempt while a request is in flight", () => {
    installSessionStorage();
    assert.equal(
      canAttemptEmailSend("confirmation", "alex@example.com", { inFlight: true, now: 1_000 }),
      false,
    );
    assert.equal(
      canAttemptEmailSend("recovery", "alex@example.com", { inFlight: true, now: 1_000 }),
      false,
    );
    startCooldown("confirmation", "alex@example.com", 10_000);
    assert.equal(
      canAttemptEmailSend("confirmation", "alex@example.com", { inFlight: false, now: 10_000 }),
      false,
    );
  });

  it("does not start a cooldown on network failure", () => {
    installSessionStorage();
    assert.equal(shouldStartEmailCooldown("network"), false);
    if (shouldStartEmailCooldown("network")) {
      startCooldown("confirmation", "alex@example.com", 10_000);
    }
    assert.equal(getRemainingCooldown("confirmation", "alex@example.com", 10_000), 0);
  });

  it("does not start a new UX cooldown when the provider rate-limits", () => {
    installSessionStorage();
    const outcome = interpretResendResponse({
      name: "AuthApiError",
      message: "email rate limit exceeded",
      code: "over_email_send_rate_limit",
      status: 429,
    });
    assert.equal(outcome.kind, "error");
    if (outcome.kind !== "error") return;
    assert.equal(outcome.error.code, "rate_limit");
    assert.match(outcome.error.message, /correos recientemente/i);
    assert.equal(isTechnicalAuthLeak(outcome.error.message), false);
    assert.equal(shouldStartEmailCooldown(outcome.error.code), false);
    if (outcome.kind === "success" || shouldStartEmailCooldown(outcome.error.code)) {
      startCooldown("confirmation", "alex@example.com", 10_000);
    }
    assert.equal(getRemainingCooldown("confirmation", "alex@example.com", 10_000), 0);
  });

  it("starts cooldown after an accepted send", () => {
    installSessionStorage();
    const outcome = interpretResendResponse(null);
    assert.equal(outcome.kind, "success");
    assert.equal(shouldStartEmailCooldown(null), true);
    startCooldown("confirmation", "alex@example.com", 10_000);
    assert.equal(getRemainingCooldown("confirmation", "alex@example.com", 10_000), 60);
  });

  it("never writes a password into sessionStorage", () => {
    installSessionStorage();
    startCooldown("recovery", "alex@example.com", 10_000);
    const raw = storedRaw();
    assert.equal(raw.toLowerCase().includes("password"), false);
    assert.equal(raw.toLowerCase().includes("passwd"), false);
    assert.deepEqual(readEmailCooldownStorage(10_000), [
      { action: "recovery", email: "alex@example.com", sentAt: 10_000 },
    ]);
  });

  it("never writes auth tokens into sessionStorage", () => {
    installSessionStorage();
    startCooldown("confirmation", "alex@example.com", 10_000);
    const raw = storedRaw();
    assert.doesNotMatch(raw, /access_token/i);
    assert.doesNotMatch(raw, /refresh_token/i);
    assert.doesNotMatch(raw, /recovery[_-]?token/i);
    assert.doesNotMatch(raw, /confirmation[_-]?token/i);
    assert.doesNotMatch(raw, /"token"/i);
  });

  it("drops poisoned storage that contains a password or token field", () => {
    installSessionStorage();
    sessionStorage.setItem(
      EMAIL_COOLDOWN_STORAGE_KEY,
      JSON.stringify({
        "confirmation:alex@example.com": {
          action: "confirmation",
          email: "alex@example.com",
          sentAt: 10_000,
          password: "super-secret",
          access_token: "leak",
        },
      }),
    );
    assert.equal(getRemainingCooldown("confirmation", "alex@example.com", 10_000), 0);
    const raw = storedRaw();
    assert.equal(raw.toLowerCase().includes("password"), false);
    assert.equal(raw.toLowerCase().includes("access_token"), false);
    assert.equal(raw.includes("super-secret"), false);
    assert.equal(raw.includes("leak"), false);
  });

  it("formats the visible countdown without calling a provider", () => {
    assert.equal(emailCooldownCountdownLabel("Reenviar", 59), "Reenviar en 59 s");
    assert.equal(emailCooldownCountdownLabel("Enviar", 1), "Enviar en 1 s");
    assert.equal(emailCooldownRetryHint(59), "Podrás solicitar otro en 59 s.");
  });

  it("keeps the confirmation cooldown after returning to login with the same email", () => {
    installSessionStorage();
    const sentAt = 10_000;
    startCooldown("confirmation", "  Alex@Example.COM ", sentAt);
    const remaining = getRemainingCooldown("confirmation", "alex@example.com", sentAt + 1_000);
    assert.equal(remaining, 59);
    assert.equal(isCoolingDown("confirmation", "alex@example.com", sentAt + 1_000), true);
  });
});
