/**
 * Client-side credential checks and public auth error copy.
 *
 * These helpers never log passwords and never expose raw Supabase/Postgres
 * messages. Login and recovery copy avoids user enumeration.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return EMAIL_PATTERN.test(normalizeEmail(email));
}

export type AuthContext = "login" | "signup" | "recovery" | "update-password";

export function validateSignupInput(input: {
  email: string;
  password: string;
  confirmPassword: string;
}): string | null {
  if (!isValidEmail(input.email)) return "Ingresa un correo válido.";
  if (!input.password) return "Ingresa una contraseña.";
  if (input.password !== input.confirmPassword) return "Las contraseñas no coinciden.";
  return null;
}

export function validateLoginInput(input: { email: string; password: string }): string | null {
  if (!isValidEmail(input.email)) return "Ingresa un correo válido.";
  if (!input.password) return "Ingresa una contraseña.";
  return null;
}

export function validateRecoveryEmail(email: string): string | null {
  if (!isValidEmail(email)) return "Ingresa un correo válido.";
  return null;
}

export function validateNewPassword(input: {
  password: string;
  confirmPassword: string;
}): string | null {
  if (!input.password) return "Ingresa una contraseña.";
  if (input.password !== input.confirmPassword) return "Las contraseñas no coinciden.";
  return null;
}

export const RECOVERY_SENT_MESSAGE =
  "Si el correo está registrado, te enviaremos un enlace para restablecer la contraseña.";

export function publicAuthErrorMessage(context: AuthContext): string {
  switch (context) {
    case "login":
      return "Email o contraseña incorrectos.";
    case "signup":
      return "No pudimos crear la cuenta. Si ya tienes una, inicia sesión.";
    case "recovery":
      return "No pudimos enviar el enlace. Inténtalo de nuevo.";
    case "update-password":
      return "No pudimos actualizar la contraseña. Inténtalo de nuevo.";
  }
}
