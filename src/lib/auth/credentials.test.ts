import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CONFIRM_EMAIL_BACK_TO_LOGIN,
  CONFIRM_EMAIL_HAS_ACCOUNT_PROMPT,
  CONFIRM_EMAIL_HEADING,
  CONFIRM_EMAIL_INTRO,
  CONFIRM_EMAIL_NEXT_STEP,
  confirmEmailDisplayAddress,
  isValidEmail,
  leaveConfirmEmailView,
  MAX_EMAIL_LENGTH,
  MIN_PASSWORD_LENGTH,
  normalizeEmail,
  publicAuthErrorMessage,
  RECOVERY_SENT_MESSAGE,
  SIGNUP_EXISTS_MESSAGE,
  validateLoginInput,
  validateNewPassword,
  validateRecoveryEmail,
  validateSignupInput,
} from "./credentials.ts";

describe("normalizeEmail / isValidEmail", () => {
  it("trims and lowercases email", () => {
    assert.equal(normalizeEmail("  Alex@Example.COM "), "alex@example.com");
  });

  it("accepts a simple email", () => {
    assert.equal(isValidEmail("alex@example.com"), true);
  });

  it("rejects empty email", () => {
    assert.equal(isValidEmail(""), false);
    assert.equal(isValidEmail("   "), false);
  });

  it("rejects malformed email", () => {
    assert.equal(isValidEmail("alex"), false);
    assert.equal(isValidEmail("alex@"), false);
    assert.equal(isValidEmail("alex@example"), false);
  });

  it("rejects excessive email length", () => {
    const local = "a".repeat(MAX_EMAIL_LENGTH);
    assert.equal(isValidEmail(`${local}@example.com`), false);
  });
});

describe("validateSignupInput", () => {
  it("rejects empty email", () => {
    assert.equal(
      validateSignupInput({ email: "", password: "secret1", confirmPassword: "secret1" }),
      "Ingresa un correo válido.",
    );
  });

  it("rejects malformed email", () => {
    assert.equal(
      validateSignupInput({ email: "nope", password: "secret1", confirmPassword: "secret1" }),
      "Ingresa un correo válido.",
    );
  });

  it("requires a password", () => {
    assert.equal(
      validateSignupInput({ email: "alex@example.com", password: "", confirmPassword: "" }),
      "Ingresa una contraseña.",
    );
  });

  it("rejects a password below the current minimum", () => {
    assert.equal(
      validateSignupInput({ email: "alex@example.com", password: "12345", confirmPassword: "12345" }),
      `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`,
    );
  });

  it("requires matching confirmation", () => {
    assert.equal(
      validateSignupInput({
        email: "alex@example.com",
        password: "secret1",
        confirmPassword: "other12",
      }),
      "Las contraseñas no coinciden.",
    );
  });

  it("accepts matching credentials", () => {
    assert.equal(
      validateSignupInput({
        email: "alex@example.com",
        password: "secret1",
        confirmPassword: "secret1",
      }),
      null,
    );
  });
});

describe("validateLoginInput", () => {
  it("requires email and password", () => {
    assert.equal(validateLoginInput({ email: "", password: "x" }), "Ingresa un correo válido.");
    assert.equal(validateLoginInput({ email: "alex@example.com", password: "" }), "Ingresa una contraseña.");
  });
});

describe("validateRecoveryEmail / validateNewPassword", () => {
  it("validates recovery email", () => {
    assert.equal(validateRecoveryEmail("nope"), "Ingresa un correo válido.");
    assert.equal(validateRecoveryEmail("alex@example.com"), null);
  });

  it("rejects an empty password", () => {
    assert.equal(validateNewPassword({ password: "", confirmPassword: "" }), "Ingresa una contraseña.");
  });

  it("rejects a confirmation mismatch", () => {
    assert.equal(
      validateNewPassword({ password: "secret1", confirmPassword: "secret2" }),
      "Las contraseñas no coinciden.",
    );
  });

  it("accepts a matching new password", () => {
    assert.equal(validateNewPassword({ password: "secret1", confirmPassword: "secret1" }), null);
  });
});

describe("publicAuthErrorMessage", () => {
  it("does not expose provider or database details", () => {
    assert.equal(publicAuthErrorMessage("login"), "Email o contraseña incorrectos.");
    assert.equal(publicAuthErrorMessage("signup"), SIGNUP_EXISTS_MESSAGE);
    assert.match(RECOVERY_SENT_MESSAGE, /Si el correo está registrado/);
    assert.equal(SIGNUP_EXISTS_MESSAGE.includes("ya está registrado"), false);
  });
});

describe("confirm-email copy and login return", () => {
  it("does not claim that a confirmation email was sent", () => {
    assert.match(CONFIRM_EMAIL_HEADING, /Revisa tu correo/);
    assert.match(CONFIRM_EMAIL_INTRO, /Si podemos crear una cuenta/i);
    assert.doesNotMatch(CONFIRM_EMAIL_INTRO, /Te enviamos/i);
    assert.doesNotMatch(CONFIRM_EMAIL_NEXT_STEP, /Te enviamos/i);
    assert.doesNotMatch(CONFIRM_EMAIL_INTRO, /ya está registrado/i);
    assert.doesNotMatch(CONFIRM_EMAIL_HAS_ACCOUNT_PROMPT, /ya está registrado/i);
  });

  it("renders the signup email as normalized text", () => {
    assert.equal(confirmEmailDisplayAddress("  Alex@Example.COM "), "alex@example.com");
    assert.equal(confirmEmailDisplayAddress(""), "tu correo");
  });

  it("G: returning to login keeps the normalized email and does not invent a session", () => {
    const next = leaveConfirmEmailView("  Alex@Example.COM ");
    assert.equal(next.view, "login");
    assert.equal(next.email, "alex@example.com");
    assert.equal(CONFIRM_EMAIL_BACK_TO_LOGIN, "Volver a iniciar sesión");
    assert.equal("session" in next, false);
  });
});
