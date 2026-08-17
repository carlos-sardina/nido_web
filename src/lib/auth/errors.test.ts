import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyAuthError,
  interpretSignupResponse,
  isTechnicalAuthLeak,
  publicMessageForAuthFailure,
} from "./errors.ts";
import {
  clearPendingInvitationToken,
  peekPendingInvitationToken,
  savePendingInvitationToken,
} from "./pending-flow.ts";
import { resolveAppEntry } from "./destination.ts";

function authError(input: { message?: string; code?: string; status?: number; name?: string }) {
  return {
    name: input.name ?? "AuthApiError",
    message: input.message ?? "",
    code: input.code,
    status: input.status,
  };
}

describe("classifyAuthError", () => {
  it("maps email rate limit to a typed rate_limit error", () => {
    const classified = classifyAuthError(
      authError({
        message: "email rate limit exceeded",
        code: "over_email_send_rate_limit",
        status: 429,
      }),
      "signup",
    );
    assert.equal(classified.code, "rate_limit");
    assert.match(classified.message, /correos recientemente/i);
    assert.equal(isTechnicalAuthLeak(classified.message), false);
  });

  it("maps rate limit from status 429 even without a provider code", () => {
    const classified = classifyAuthError(
      authError({ message: "email rate limit exceeded", status: 429 }),
      "signup",
    );
    assert.equal(classified.code, "rate_limit");
  });

  it("maps invalid credentials", () => {
    const classified = classifyAuthError(
      authError({
        message: "Invalid login credentials",
        code: "invalid_credentials",
        status: 400,
      }),
      "login",
    );
    assert.equal(classified.code, "invalid_credentials");
    assert.equal(classified.message, "Email o contraseña incorrectos.");
  });

  it("maps email not confirmed", () => {
    const classified = classifyAuthError(
      authError({
        message: "Email not confirmed",
        code: "email_not_confirmed",
        status: 400,
      }),
      "login",
    );
    assert.equal(classified.code, "email_not_confirmed");
    assert.match(classified.message, /Confirma tu correo/);
  });

  it("maps a generic auth error without leaking provider text", () => {
    const classified = classifyAuthError(
      authError({
        name: "AuthApiError",
        message: "unexpected_failure from GoTrue",
        code: "unexpected_failure",
        status: 500,
      }),
      "signup",
    );
    assert.equal(classified.code, "generic");
    assert.equal(isTechnicalAuthLeak(classified.message), false);
    assert.doesNotMatch(classified.message, /AuthApiError/i);
    assert.doesNotMatch(classified.message, /unexpected_failure/);
  });

  it("does not use login messages that enumerate existing emails", () => {
    const classified = classifyAuthError(
      authError({ message: "User already registered", code: "user_already_exists" }),
      "login",
    );
    assert.equal(classified.code, "invalid_credentials");
    assert.equal(classified.message, publicMessageForAuthFailure("invalid_credentials", "login"));
  });

  it("maps an existing-account signup without enumeration", () => {
    const classified = classifyAuthError(
      authError({ message: "User already registered", code: "user_already_exists", status: 422 }),
      "signup",
    );
    assert.equal(classified.code, "already_registered");
    assert.match(classified.message, /Si ya tienes una cuenta/i);
    assert.doesNotMatch(classified.message, /ya está registrado/i);
    assert.doesNotMatch(classified.message, /AuthApiError/i);
    assert.equal(isTechnicalAuthLeak(classified.message), false);
  });

  it("maps a weak password without leaking provider text", () => {
    const classified = classifyAuthError(
      authError({ message: "Password is known to be weak", code: "weak_password", status: 422 }),
      "signup",
    );
    assert.equal(classified.code, "weak_password");
    assert.doesNotMatch(classified.message, /known to be weak/i);
  });

  it("maps a network failure", () => {
    const classified = classifyAuthError(
      authError({ name: "AuthRetryableFetchError", message: "Failed to fetch", status: 0 }),
      "login",
    );
    assert.equal(classified.code, "network");
  });
});

describe("interpretSignupResponse", () => {
  it("treats rate limit as a failed signup, not a session or confirm-email step", () => {
    const outcome = interpretSignupResponse({
      data: { session: null },
      error: authError({
        message: "email rate limit exceeded",
        code: "over_email_send_rate_limit",
        status: 429,
      }),
    });
    assert.equal(outcome.kind, "error");
    if (outcome.kind !== "error") return;
    assert.equal(outcome.error.code, "rate_limit");
    assert.equal(isTechnicalAuthLeak(outcome.error.message), false);
    assert.notEqual(outcome.kind, "authenticated");
    assert.notEqual(outcome.kind, "confirm_email");
  });

  it("does not treat a failed signup as authenticated", () => {
    const outcome = interpretSignupResponse({
      data: { session: { access_token: "secret" } },
      error: authError({ message: "email rate limit exceeded", status: 429 }),
    });
    assert.equal(outcome.kind, "error");
  });

  it("A: new signup without a session is the generic confirm-email flow", () => {
    const outcome = interpretSignupResponse({
      data: { session: null },
      error: null,
    });
    assert.equal(outcome.kind, "confirm_email");
  });

  it("B: obfuscated existing confirmed user stays on the same confirm-email flow", () => {
    // Mock of the GoTrue/docs shape (Confirm email on). Not a live capture.
    // identities are present in the payload and must be ignored.
    const outcome = interpretSignupResponse({
      data: { session: null, user: { identities: [] } },
      error: null,
    });
    assert.equal(outcome.kind, "confirm_email");
    assert.notEqual(outcome.kind, "error");
  });

  it("C: existing unconfirmed user without a session stays on the same confirm-email flow", () => {
    // Mock: existing unconfirmed user returned without a session. The frontend
    // must not assume a new account, Nido, or profile was created.
    const outcome = interpretSignupResponse({
      data: {
        session: null,
        user: { identities: [{ provider: "email" }] },
      },
      error: null,
    });
    assert.equal(outcome.kind, "confirm_email");
    assert.notEqual(outcome.kind, "authenticated");
    assert.notEqual(outcome.kind, "error");
  });

  it("D: explicit user_already_exists is a generic failed signup, not confirm-email", () => {
    const outcome = interpretSignupResponse({
      data: { session: null },
      error: authError({ message: "User already registered", code: "user_already_exists" }),
    });
    assert.equal(outcome.kind, "error");
    if (outcome.kind !== "error") return;
    assert.equal(outcome.error.code, "already_registered");
    assert.match(outcome.error.message, /Si ya tienes una cuenta/i);
    assert.doesNotMatch(outcome.error.message, /ya está registrado/i);
    assert.equal(isTechnicalAuthLeak(outcome.error.message), false);
  });
});

describe("pending invitation survives a rate-limited signup", () => {
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

  it("does not require a pending create/join choice after a rate-limit error", () => {
    installSessionStorage();
    memory.clear();

    const outcome = interpretSignupResponse({
      error: authError({ message: "email rate limit exceeded", status: 429 }),
    });
    assert.equal(outcome.kind, "error");
    assert.deepEqual(
      resolveAppEntry({
        authStatus: "unauthenticated",
        membershipStatus: "unauthenticated",
        pendingInviteToken: null,
      }),
      { kind: "landing" },
    );
  });

  it("keeps pending join token after a rate-limit error", () => {
    installSessionStorage();
    memory.clear();
    savePendingInvitationToken("invite-token-value-1");

    const outcome = interpretSignupResponse({
      error: authError({
        message: "email rate limit exceeded",
        code: "over_email_send_rate_limit",
        status: 429,
      }),
    });
    assert.equal(outcome.kind, "error");
    assert.equal(peekPendingInvitationToken(), "invite-token-value-1");
    assert.deepEqual(
      resolveAppEntry({
        authStatus: "authenticated",
        membershipStatus: "no_nido",
        pendingInviteToken: peekPendingInvitationToken(),
      }),
      { kind: "join_invite", token: "invite-token-value-1" },
    );

    clearPendingInvitationToken();
  });
});
