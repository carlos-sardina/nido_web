/**
 * Non-secret UI flag so every tab can tell a password-recovery session apart
 * from a normal login. Not an access token, refresh token, or password.
 *
 * Set on the auth callback redirect when `next` is the update-password page.
 * Cleared after `updateUser({ password })` or logout. Readable by the browser
 * client (`httpOnly: false`) so `useAuth()` can classify the session.
 *
 * Callers must pass a path already sanitized with `safeNextPath()`.
 */
export const PASSWORD_RECOVERY_PATH = "/auth/update-password";
export const PASSWORD_RECOVERY_COOKIE = "nido-password-recovery";
export const PASSWORD_RECOVERY_COOKIE_VALUE = "1";
export const PASSWORD_RECOVERY_COOKIE_MAX_AGE = 60 * 60;

export const RECOVERY_LINK_INVALID_MESSAGE =
  "Este enlace no es válido o ya expiró. Solicita uno nuevo desde la pantalla de inicio.";

export type PasswordRecoveryMarkerCookie = {
  name: string;
  value: string;
  options: {
    path: "/";
    maxAge: number;
    sameSite: "lax";
    httpOnly: false;
    secure: boolean;
  };
};

export function isPasswordRecoveryPath(next: string | null | undefined): boolean {
  return next === PASSWORD_RECOVERY_PATH;
}

export function passwordRecoveryMarkerCookie(): PasswordRecoveryMarkerCookie {
  return {
    name: PASSWORD_RECOVERY_COOKIE,
    value: PASSWORD_RECOVERY_COOKIE_VALUE,
    options: {
      path: "/",
      maxAge: PASSWORD_RECOVERY_COOKIE_MAX_AGE,
      sameSite: "lax",
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
    },
  };
}

export function recoveryMarkerCookiesForNext(next: string | null | undefined): PasswordRecoveryMarkerCookie[] {
  return isPasswordRecoveryPath(next) ? [passwordRecoveryMarkerCookie()] : [];
}

export function markPasswordRecovery() {
  writePasswordRecoveryCookie(PASSWORD_RECOVERY_COOKIE_VALUE, PASSWORD_RECOVERY_COOKIE_MAX_AGE);
}

export function clearPasswordRecoveryMarker() {
  writePasswordRecoveryCookie("", 0);
}

export function hasPasswordRecoveryMarker(): boolean {
  if (typeof document === "undefined") return false;
  const prefix = `${PASSWORD_RECOVERY_COOKIE}=`;
  return document.cookie.split("; ").some((part) => {
    if (!part.startsWith(prefix)) return false;
    return part.slice(prefix.length) === PASSWORD_RECOVERY_COOKIE_VALUE;
  });
}

function writePasswordRecoveryCookie(value: string, maxAge: number) {
  if (typeof document === "undefined") return;
  const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${PASSWORD_RECOVERY_COOKIE}=${value}; path=/; max-age=${maxAge}; samesite=lax${secure}`;
}
