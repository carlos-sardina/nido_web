/**
 * Typed Supabase Auth failures.
 *
 * Classify by provider `code` and HTTP `status` first. Message text is a
 * fallback only. Public copy never includes AuthApiError, Postgres, or
 * raw provider strings. Debug logs keep status/code only — no passwords,
 * tokens, or email bodies.
 */

import type { AuthContext } from "./credentials";

export type AuthFailureCode =
  | "rate_limit"
  | "already_registered"
  | "invalid_credentials"
  | "invalid_email"
  | "weak_password"
  | "email_not_confirmed"
  | "network"
  | "generic";

export type ClassifiedAuthError = {
  code: AuthFailureCode;
  message: string;
  debug: {
    status: number | null;
    providerCode: string | null;
  };
};

export type SignupOutcome =
  | { kind: "authenticated" }
  | { kind: "confirm_email" }
  | { kind: "error"; error: ClassifiedAuthError };

export type ResendOutcome =
  | { kind: "success"; message: string }
  | { kind: "error"; error: ClassifiedAuthError };

export const RESEND_SUCCESS_MESSAGE =
  "Si podemos enviar un correo a esta dirección, recibirás uno en breve.";

const RATE_LIMIT_MESSAGE =
  "Has solicitado demasiados correos recientemente. Espera unos minutos antes de volver a intentarlo.";

const NETWORK_MESSAGE = "No pudimos conectar. Revisa tu conexión e inténtalo de nuevo.";

const WEAK_PASSWORD_MESSAGE = "Esa contraseña es demasiado débil. Elige otra.";

const INVALID_EMAIL_MESSAGE = "Ingresa un correo válido.";

const EMAIL_NOT_CONFIRMED_MESSAGE =
  "Confirma tu correo antes de continuar. Revisa tu bandeja e inténtalo de nuevo.";

const LOGIN_INVALID_MESSAGE = "Email o contraseña incorrectos.";

const SIGNUP_EXISTS_MESSAGE =
  "No pudimos crear la cuenta con ese correo. Si ya tienes una cuenta, intenta iniciar sesión.";

const SIGNUP_GENERIC_MESSAGE = "No pudimos completar el registro. Inténtalo de nuevo.";

const RESEND_GENERIC_MESSAGE = "No pudimos enviar el correo. Inténtalo de nuevo.";

const RECOVERY_GENERIC_MESSAGE = "No pudimos enviar el enlace. Inténtalo de nuevo.";

const UPDATE_PASSWORD_GENERIC_MESSAGE =
  "No pudimos actualizar la contraseña. Inténtalo de nuevo.";

const PROVIDER_RATE_LIMIT = new Set([
  "over_email_send_rate_limit",
  "over_sms_send_rate_limit",
  "over_request_rate_limit",
]);

const PROVIDER_ALREADY_REGISTERED = new Set([
  "user_already_exists",
  "email_exists",
  "phone_exists",
]);

const PROVIDER_INVALID_CREDENTIALS = new Set([
  "invalid_credentials",
  "invalid_grant",
]);

const PROVIDER_EMAIL_NOT_CONFIRMED = new Set([
  "email_not_confirmed",
  "phone_not_confirmed",
]);

const PROVIDER_WEAK_PASSWORD = new Set(["weak_password"]);

const PROVIDER_INVALID_EMAIL = new Set(["email_address_invalid"]);

function readString(error: object, key: string): string | null {
  const value = (error as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readStatus(error: object): number | null {
  const value = (error as Record<string, unknown>).status;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function publicMessageForAuthFailure(
  code: AuthFailureCode,
  context: AuthContext,
): string {
  switch (code) {
    case "rate_limit":
      return RATE_LIMIT_MESSAGE;
    case "network":
      return NETWORK_MESSAGE;
    case "weak_password":
      return WEAK_PASSWORD_MESSAGE;
    case "invalid_email":
      return INVALID_EMAIL_MESSAGE;
    case "email_not_confirmed":
      return EMAIL_NOT_CONFIRMED_MESSAGE;
    case "invalid_credentials":
      return LOGIN_INVALID_MESSAGE;
    case "already_registered":
      return context === "signup" ? SIGNUP_EXISTS_MESSAGE : LOGIN_INVALID_MESSAGE;
    case "generic":
      if (context === "login") return LOGIN_INVALID_MESSAGE;
      if (context === "signup") return SIGNUP_GENERIC_MESSAGE;
      if (context === "recovery") return RECOVERY_GENERIC_MESSAGE;
      if (context === "resend") return RESEND_GENERIC_MESSAGE;
      return UPDATE_PASSWORD_GENERIC_MESSAGE;
  }
}

function failureCodeFromProvider(providerCode: string, status: number | null): AuthFailureCode | null {
  if (PROVIDER_RATE_LIMIT.has(providerCode) || status === 429) return "rate_limit";
  if (PROVIDER_ALREADY_REGISTERED.has(providerCode)) return "already_registered";
  if (PROVIDER_INVALID_CREDENTIALS.has(providerCode)) return "invalid_credentials";
  if (PROVIDER_EMAIL_NOT_CONFIRMED.has(providerCode)) return "email_not_confirmed";
  if (PROVIDER_WEAK_PASSWORD.has(providerCode)) return "weak_password";
  if (PROVIDER_INVALID_EMAIL.has(providerCode)) return "invalid_email";
  return null;
}

function failureCodeFromMessage(message: string, status: number | null): AuthFailureCode | null {
  if (status === 429) return "rate_limit";
  if (
    message.includes("email rate limit exceeded") ||
    message.includes("over_email_send_rate_limit") ||
    message.includes("rate limit") ||
    message.includes("too many requests")
  ) {
    return "rate_limit";
  }
  if (
    message.includes("failed to fetch") ||
    message.includes("network") ||
    message.includes("fetch failed") ||
    message.includes("load failed")
  ) {
    return "network";
  }
  if (message.includes("email not confirmed")) return "email_not_confirmed";
  if (message.includes("weak password") || message.includes("password is known to be weak")) {
    return "weak_password";
  }
  if (
    message.includes("already registered") ||
    message.includes("already been registered") ||
    message.includes("user already exists")
  ) {
    return "already_registered";
  }
  if (message.includes("invalid login") || message.includes("invalid credentials")) {
    return "invalid_credentials";
  }
  if (message.includes("invalid email") || message.includes("unable to validate email")) {
    return "invalid_email";
  }
  return null;
}

export function classifyAuthError(error: unknown, context: AuthContext): ClassifiedAuthError {
  const fallback: ClassifiedAuthError = {
    code: "generic",
    message: publicMessageForAuthFailure("generic", context),
    debug: { status: null, providerCode: null },
  };

  if (!error || typeof error !== "object") {
    if (typeof error === "string" && error.trim()) {
      const fromMessage = failureCodeFromMessage(normalize(error), null);
      if (fromMessage) {
        return {
          code: fromMessage,
          message: publicMessageForAuthFailure(fromMessage, context),
          debug: { status: null, providerCode: null },
        };
      }
    }
    return fallback;
  }

  const status = readStatus(error);
  const providerCode = readString(error, "code");
  const rawMessage = readString(error, "message") ?? (error instanceof Error ? error.message : "");
  const name = readString(error, "name") ?? (error instanceof Error ? error.name : "");

  let code: AuthFailureCode | null = null;
  if (providerCode) code = failureCodeFromProvider(normalize(providerCode), status);
  if (!code && (name === "AuthRetryableFetchError" || status === 0)) code = "network";
  if (!code) code = failureCodeFromMessage(normalize(rawMessage), status);
  if (!code && status === 429) code = "rate_limit";
  if (!code) code = "generic";

  if (context === "login" && (code === "already_registered" || code === "invalid_email")) {
    code = "invalid_credentials";
  }

  return {
    code,
    message: publicMessageForAuthFailure(code, context),
    debug: {
      status,
      providerCode: providerCode ? normalize(providerCode) : null,
    },
  };
}

export function interpretSignupResponse(result: {
  data?: { session?: unknown } | null;
  error?: unknown;
}): SignupOutcome {
  if (result.error) {
    return { kind: "error", error: classifyAuthError(result.error, "signup") };
  }
  if (result.data?.session) {
    return { kind: "authenticated" };
  }
  return { kind: "confirm_email" };
}

/**
 * Rate-limit and network failures are shown. Every other provider result
 * is treated as success so the UI cannot be used to enumerate accounts.
 */
export function interpretResendResponse(error: unknown): ResendOutcome {
  if (!error) {
    return { kind: "success", message: RESEND_SUCCESS_MESSAGE };
  }

  const classified = classifyAuthError(error, "resend");
  if (classified.code === "rate_limit" || classified.code === "network") {
    return { kind: "error", error: classified };
  }

  return { kind: "success", message: RESEND_SUCCESS_MESSAGE };
}

export function logAuthFailure(error: ClassifiedAuthError): void {
  console.error("Auth failed", {
    code: error.code,
    status: error.debug.status,
    providerCode: error.debug.providerCode,
  });
}

export function isTechnicalAuthLeak(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("authapierror") ||
    lower.includes("email rate limit exceeded") ||
    lower.includes("over_email_send_rate_limit") ||
    lower.includes("postgres") ||
    lower.includes("pgrst") ||
    lower.includes("jwt")
  );
}
