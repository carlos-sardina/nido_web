/**
 * Client-side credential checks and public auth error copy.
 *
 * These helpers never log passwords and never expose raw Supabase/Postgres
 * messages. Login and recovery copy avoids user enumeration.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** RFC 5321 practical maximum. */
export const MAX_EMAIL_LENGTH = 254;

/** Matches Supabase Auth `minimum_password_length`. */
export const MIN_PASSWORD_LENGTH = 6;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  const normalized = normalizeEmail(email);
  if (!normalized || normalized.length > MAX_EMAIL_LENGTH) return false;
  return EMAIL_PATTERN.test(normalized);
}

export type AuthContext = "login" | "signup" | "recovery" | "update-password" | "resend";

export function validateEmailInput(email: string): string | null {
  const normalized = normalizeEmail(email);
  if (!normalized) return "Ingresa un correo válido.";
  if (normalized.length > MAX_EMAIL_LENGTH) return "Ingresa un correo válido.";
  if (!isValidEmail(email)) return "Ingresa un correo válido.";
  return null;
}

export function validatePasswordInput(password: string): string | null {
  if (!password) return "Ingresa una contraseña.";
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  }
  return null;
}

export function validateSignupInput(input: {
  email: string;
  password: string;
  confirmPassword: string;
}): string | null {
  return validateEmailInput(input.email)
    ?? validatePasswordInput(input.password)
    ?? (input.password !== input.confirmPassword ? "Las contraseñas no coinciden." : null);
}

export function validateLoginInput(input: { email: string; password: string }): string | null {
  return validateEmailInput(input.email)
    ?? (input.password ? null : "Ingresa una contraseña.");
}

export function validateRecoveryEmail(email: string): string | null {
  return validateEmailInput(email);
}

export function validateNewPassword(input: {
  password: string;
  confirmPassword: string;
}): string | null {
  return validatePasswordInput(input.password)
    ?? (input.password !== input.confirmPassword ? "Las contraseñas no coinciden." : null);
}

export const RECOVERY_SENT_MESSAGE =
  "Si el correo está registrado, te enviaremos un enlace para restablecer la contraseña.";

export const SIGNUP_EXISTS_MESSAGE =
  "No pudimos crear la cuenta con ese correo. Si ya tienes una cuenta, intenta iniciar sesión.";

export const CONFIRM_EMAIL_HEADING = "Revisa tu correo 📬";

export const CONFIRM_EMAIL_INTRO =
  "Si podemos crear una cuenta con este correo, recibirás un enlace de confirmación en:";

export const CONFIRM_EMAIL_NEXT_STEP =
  "Confirma tu correo para continuar con Nido.";

export const CONFIRM_EMAIL_HAS_ACCOUNT_PROMPT = "¿Ya tienes una cuenta?";

export const CONFIRM_EMAIL_BACK_TO_LOGIN = "Volver a iniciar sesión";

export function confirmEmailDisplayAddress(email: string): string {
  return normalizeEmail(email) || "tu correo";
}

/**
 * Leaving the generic confirmation screen returns to login with the same
 * normalized email. It does not create a session or clear the UX cooldown.
 */
export function leaveConfirmEmailView(email: string): { view: "login"; email: string } {
  return { view: "login", email: normalizeEmail(email) };
}

export function publicAuthErrorMessage(context: AuthContext): string {
  switch (context) {
    case "login":
      return "Email o contraseña incorrectos.";
    case "signup":
      return SIGNUP_EXISTS_MESSAGE;
    case "recovery":
      return "No pudimos enviar el enlace. Inténtalo de nuevo.";
    case "update-password":
      return "No pudimos actualizar la contraseña. Inténtalo de nuevo.";
    case "resend":
      return "No pudimos enviar el correo. Inténtalo de nuevo.";
  }
}
