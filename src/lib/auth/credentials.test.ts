import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isValidEmail,
  normalizeEmail,
  publicAuthErrorMessage,
  RECOVERY_SENT_MESSAGE,
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

  it("rejects empty or incomplete values", () => {
    assert.equal(isValidEmail(""), false);
    assert.equal(isValidEmail("alex"), false);
    assert.equal(isValidEmail("alex@"), false);
  });
});

describe("validateSignupInput", () => {
  it("requires a valid email", () => {
    assert.equal(
      validateSignupInput({ email: "nope", password: "secret", confirmPassword: "secret" }),
      "Ingresa un correo válido.",
    );
  });

  it("requires a password", () => {
    assert.equal(
      validateSignupInput({ email: "alex@example.com", password: "", confirmPassword: "" }),
      "Ingresa una contraseña.",
    );
  });

  it("requires matching confirmation", () => {
    assert.equal(
      validateSignupInput({
        email: "alex@example.com",
        password: "secret",
        confirmPassword: "other",
      }),
      "Las contraseñas no coinciden.",
    );
  });

  it("accepts matching credentials", () => {
    assert.equal(
      validateSignupInput({
        email: "alex@example.com",
        password: "secret",
        confirmPassword: "secret",
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

  it("validates the new password pair", () => {
    assert.equal(validateNewPassword({ password: "", confirmPassword: "" }), "Ingresa una contraseña.");
    assert.equal(
      validateNewPassword({ password: "a", confirmPassword: "b" }),
      "Las contraseñas no coinciden.",
    );
    assert.equal(validateNewPassword({ password: "a", confirmPassword: "a" }), null);
  });
});

describe("publicAuthErrorMessage", () => {
  it("does not expose provider or database details", () => {
    assert.equal(publicAuthErrorMessage("login"), "Email o contraseña incorrectos.");
    assert.match(publicAuthErrorMessage("signup"), /cuenta/);
    assert.match(RECOVERY_SENT_MESSAGE, /Si el correo está registrado/);
  });
});
