import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  interpretResendResponse,
  isTechnicalAuthLeak,
  RESEND_SUCCESS_MESSAGE,
} from "./errors.ts";
import { shouldStartEmailCooldown } from "./email-cooldown.ts";

function authError(input: { message?: string; code?: string; status?: number; name?: string }) {
  return {
    name: input.name ?? "AuthApiError",
    message: input.message ?? "",
    code: input.code,
    status: input.status,
  };
}

describe("interpretResendResponse", () => {
  it("treats a successful resend without revealing existence", () => {
    const outcome = interpretResendResponse(null);
    assert.equal(outcome.kind, "success");
    if (outcome.kind !== "success") return;
    assert.equal(outcome.message, RESEND_SUCCESS_MESSAGE);
    assert.match(outcome.message, /Si podemos enviar/);
    assert.equal(shouldStartEmailCooldown(null), true);
  });

  it("maps rate limit safely and does not start a UX cooldown", () => {
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
    assert.equal(shouldStartEmailCooldown(outcome.error.code), false);
  });

  it("does not start a UX cooldown on a network failure", () => {
    const outcome = interpretResendResponse(
      authError({
        name: "AuthRetryableFetchError",
        message: "Failed to fetch",
        status: 0,
      }),
    );
    assert.equal(outcome.kind, "error");
    if (outcome.kind !== "error") return;
    assert.equal(outcome.error.code, "network");
    assert.equal(shouldStartEmailCooldown(outcome.error.code), false);
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
    assert.doesNotMatch(outcome.message, /ya está registrado/i);
    assert.doesNotMatch(outcome.message, /el correo existe/i);
    assert.equal(shouldStartEmailCooldown(null), true);
  });
});
