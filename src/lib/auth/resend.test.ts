import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canResendConfirmation,
  RESEND_COOLDOWN_MS,
  resendCooldownRemaining,
} from "./resend.ts";
import {
  interpretResendResponse,
  isTechnicalAuthLeak,
  RESEND_SUCCESS_MESSAGE,
} from "./errors.ts";

function authError(input: { message?: string; code?: string; status?: number; name?: string }) {
  return {
    name: input.name ?? "AuthApiError",
    message: input.message ?? "",
    code: input.code,
    status: input.status,
  };
}

describe("resend confirmation cooldown", () => {
  it("allows the first request", () => {
    assert.equal(canResendConfirmation(null, 1_000), true);
    assert.equal(resendCooldownRemaining(null, 1_000), 0);
  });

  it("blocks requests inside the cooldown window", () => {
    const started = 10_000;
    assert.equal(canResendConfirmation(started, started + 1_000), false);
    assert.equal(resendCooldownRemaining(started, started + 1_000), RESEND_COOLDOWN_MS - 1_000);
  });

  it("allows a request after the cooldown", () => {
    const started = 10_000;
    assert.equal(canResendConfirmation(started, started + RESEND_COOLDOWN_MS), true);
  });
});

describe("interpretResendResponse", () => {
  it("treats a successful resend without revealing existence", () => {
    const outcome = interpretResendResponse(null);
    assert.equal(outcome.kind, "success");
    if (outcome.kind !== "success") return;
    assert.equal(outcome.message, RESEND_SUCCESS_MESSAGE);
    assert.match(outcome.message, /Si podemos enviar/);
  });

  it("maps rate limit safely", () => {
    const outcome = interpretResendResponse(
      authError({
        message: "email rate limit exceeded",
        code: "over_email_send_rate_limit",
        status: 429,
      }),
    );
    assert.equal(outcome.kind, "error");
    if (outcome.kind !== "error") return;
    assert.equal(outcome.error.code, "rate_limit");
    assert.match(outcome.error.message, /correos recientemente/i);
    assert.equal(isTechnicalAuthLeak(outcome.error.message), false);
  });

  it("does not reveal whether an unknown address exists", () => {
    const outcome = interpretResendResponse(
      authError({
        name: "AuthApiError",
        message: "User not found",
        code: "user_not_found",
        status: 400,
      }),
    );
    assert.equal(outcome.kind, "success");
    if (outcome.kind !== "success") return;
    assert.equal(outcome.message, RESEND_SUCCESS_MESSAGE);
    assert.doesNotMatch(outcome.message, /AuthApiError/i);
    assert.doesNotMatch(outcome.message, /not found/i);
  });
});
