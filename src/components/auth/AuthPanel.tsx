"use client";

import { useEffect, useRef, useState } from "react";
import {
  RECOVERY_SENT_MESSAGE,
  validateLoginInput,
  validateRecoveryEmail,
  validateSignupInput,
} from "@/lib/auth/credentials";
import {
  classifyAuthError,
  interpretResendResponse,
  interpretSignupResponse,
  logAuthFailure,
  type AuthFailureCode,
} from "@/lib/auth/errors";
import {
  canResendConfirmation,
  RESEND_COOLDOWN_MS,
} from "@/lib/auth/resend";
import {
  requestPasswordReset,
  resendSignupConfirmation,
  signInWithPassword,
  signUpWithPassword,
} from "@/lib/auth/session";
import { P } from "@/lib/palette";
import { OBtn2 } from "@/components/onboarding/OBtn2";

export type AuthView = "signup" | "login" | "forgot" | "confirm-email";

export function AuthPanel({
  initialView = "signup",
  nextPath,
  onAuthenticated,
  onEmailConfirmationPending,
  onAttempt,
  onViewChange,
}: {
  initialView?: Exclude<AuthView, "confirm-email">;
  nextPath?: string;
  onAuthenticated: () => void;
  onEmailConfirmationPending?: () => void;
  onAttempt?: () => void;
  onViewChange?: (view: AuthView) => void;
}) {
  const [view, setView] = useState<AuthView>(initialView);
  const busyRef = useRef(false);
  const [lastResendAt, setLastResendAt] = useState<number | null>(null);
  const [, setCooldownTick] = useState(0);
  const [failureCode, setFailureCode] = useState<AuthFailureCode | null>(null);

  const showView = (next: AuthView) => {
    setView(next);
    onViewChange?.(next);
  };
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const resetMessages = () => {
    setError(null);
    setInfo(null);
    setFailureCode(null);
  };

  const clearPasswords = () => {
    setPassword("");
    setConfirmPassword("");
  };

  const beginExclusive = () => {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    return true;
  };

  const endExclusive = () => {
    busyRef.current = false;
    setBusy(false);
  };

  useEffect(() => {
    if (lastResendAt == null) return;
    const remaining = lastResendAt + RESEND_COOLDOWN_MS - Date.now();
    if (remaining <= 0) return;
    const timer = window.setTimeout(() => setCooldownTick((tick) => tick + 1), remaining);
    return () => window.clearTimeout(timer);
  }, [lastResendAt]);

  const handleSignup = async () => {
    resetMessages();
    const invalid = validateSignupInput({ email, password, confirmPassword });
    if (invalid) {
      setError(invalid);
      return;
    }
    if (!beginExclusive()) return;
    onAttempt?.();
    try {
      const result = await signUpWithPassword(email, password, {
        next: nextPath,
      });
      const outcome = interpretSignupResponse(result);
      if (outcome.kind === "error") {
        logAuthFailure(outcome.error);
        setFailureCode(outcome.error.code);
        setError(outcome.error.message);
        return;
      }
      if (outcome.kind === "authenticated") {
        clearPasswords();
        onAuthenticated();
        return;
      }
      clearPasswords();
      onEmailConfirmationPending?.();
      showView("confirm-email");
    } catch (error) {
      const classified = classifyAuthError(error, "signup");
      logAuthFailure(classified);
      setFailureCode(classified.code);
      setError(classified.message);
    } finally {
      endExclusive();
    }
  };

  const handleLogin = async () => {
    resetMessages();
    const invalid = validateLoginInput({ email, password });
    if (invalid) {
      setError(invalid);
      return;
    }
    if (!beginExclusive()) return;
    onAttempt?.();
    try {
      const { error: signInError } = await signInWithPassword(email, password);
      if (signInError) {
        const classified = classifyAuthError(signInError, "login");
        logAuthFailure(classified);
        setFailureCode(classified.code);
        setError(classified.message);
        return;
      }
      clearPasswords();
      onAuthenticated();
    } catch (error) {
      const classified = classifyAuthError(error, "login");
      logAuthFailure(classified);
      setFailureCode(classified.code);
      setError(classified.message);
    } finally {
      endExclusive();
    }
  };

  const handleRecovery = async () => {
    resetMessages();
    const invalid = validateRecoveryEmail(email);
    if (invalid) {
      setError(invalid);
      return;
    }
    if (!beginExclusive()) return;
    try {
      const { error: resetError } = await requestPasswordReset(email);
      if (resetError) {
        const classified = classifyAuthError(resetError, "recovery");
        if (classified.code === "rate_limit" || classified.code === "network") {
          logAuthFailure(classified);
          setFailureCode(classified.code);
          setError(classified.message);
          return;
        }
      }
      setInfo(RECOVERY_SENT_MESSAGE);
    } catch (error) {
      const classified = classifyAuthError(error, "recovery");
      logAuthFailure(classified);
      setFailureCode(classified.code);
      setError(classified.message);
    } finally {
      endExclusive();
    }
  };

  const handleResendConfirmation = async () => {
    resetMessages();
    const now = Date.now();
    if (!canResendConfirmation(lastResendAt, now)) return;
    if (!beginExclusive()) return;
    try {
      const { error: resendError } = await resendSignupConfirmation(email, {
        next: nextPath,
      });
      const outcome = interpretResendResponse(resendError);
      setLastResendAt(Date.now());
      if (outcome.kind === "error") {
        logAuthFailure(outcome.error);
        setFailureCode(outcome.error.code);
        setError(outcome.error.message);
        return;
      }
      setInfo(outcome.message);
    } catch (error) {
      const outcome = interpretResendResponse(error);
      setLastResendAt(Date.now());
      if (outcome.kind === "error") {
        logAuthFailure(outcome.error);
        setFailureCode(outcome.error.code);
        setError(outcome.error.message);
        return;
      }
      setInfo(outcome.message);
    } finally {
      endExclusive();
    }
  };

  const resendAllowed = canResendConfirmation(lastResendAt, Date.now());
  const showSignupExistsAction = view === "signup" && failureCode === "already_registered";
  const showLoginResendAction = view === "login" && failureCode === "email_not_confirmed";

  return (
    <form
      className="w-full text-left"
      onSubmit={(event) => {
        event.preventDefault();
        if (busy || busyRef.current) return;
        if (view === "signup") void handleSignup();
        else if (view === "login") void handleLogin();
        else if (view === "forgot") void handleRecovery();
        else if (view === "confirm-email" && canResendConfirmation(lastResendAt, Date.now())) {
          void handleResendConfirmation();
        }
      }}
    >
      {view !== "confirm-email" && (
        <>
          <label className="text-xs font-semibold mb-2 block" style={{ color: P.muted }}>
            Correo
          </label>
          <input
            type="email"
            autoComplete="email"
            className="w-full py-3.5 px-4 rounded-2xl text-sm font-semibold border-2 outline-none mb-3"
            style={{ backgroundColor: P.card, borderColor: email ? P.brnDk : P.sub, color: P.text }}
            placeholder="tu@correo.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </>
      )}

      {(view === "signup" || view === "login") && (
        <>
          <label className="text-xs font-semibold mb-2 block" style={{ color: P.muted }}>
            Contraseña
          </label>
          <input
            type="password"
            autoComplete={view === "signup" ? "new-password" : "current-password"}
            className="w-full py-3.5 px-4 rounded-2xl text-sm font-semibold border-2 outline-none mb-3"
            style={{ backgroundColor: P.card, borderColor: password ? P.brnDk : P.sub, color: P.text }}
            placeholder="Contraseña"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </>
      )}

      {view === "signup" && (
        <>
          <label className="text-xs font-semibold mb-2 block" style={{ color: P.muted }}>
            Confirmar contraseña
          </label>
          <input
            type="password"
            autoComplete="new-password"
            className="w-full py-3.5 px-4 rounded-2xl text-sm font-semibold border-2 outline-none mb-4"
            style={{
              backgroundColor: P.card,
              borderColor: confirmPassword ? P.brnDk : P.sub,
              color: P.text,
            }}
            placeholder="Repite la contraseña"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
        </>
      )}

      {view === "confirm-email" && (
        <div className="text-center mb-2">
          <p className="text-sm leading-relaxed mb-3" style={{ color: P.muted }}>
            Te enviamos un enlace de confirmación a:
          </p>
          <p className="text-sm font-semibold mb-3" style={{ color: P.text }}>
            {email || "tu correo"}
          </p>
          <p className="text-sm leading-relaxed mb-4" style={{ color: P.muted }}>
            Confirma tu correo para continuar con Nido.
          </p>
          <p className="text-xs mb-3" style={{ color: P.muted }}>
            ¿No recibiste el correo?
          </p>
        </div>
      )}

      {error && (
        <p className="text-[11px] mb-3 leading-relaxed whitespace-pre-line" style={{ color: P.danger }}>
          {error}
        </p>
      )}
      {info && (
        <p className="text-[11px] mb-3 leading-relaxed" style={{ color: P.text }}>
          {info}
        </p>
      )}

      {view === "signup" && (
        <OBtn2 label={busy ? "Creando cuenta…" : "Crear cuenta"} onClick={() => undefined} disabled={busy} />
      )}
      {view === "login" && (
        <OBtn2 label={busy ? "Entrando…" : "Iniciar sesión"} onClick={() => undefined} disabled={busy} />
      )}
      {view === "forgot" && (
        <OBtn2 label={busy ? "Enviando…" : "Enviar enlace"} onClick={() => undefined} disabled={busy} />
      )}
      {view === "confirm-email" && (
        <OBtn2
          label={busy ? "Enviando…" : "Reenviar correo"}
          onClick={() => undefined}
          disabled={busy || !resendAllowed}
        />
      )}

      <div className="mt-4 space-y-2 text-center">
        {showSignupExistsAction && (
          <button
            type="button"
            className="block w-full text-xs font-semibold"
            style={{ color: P.brnDk }}
            onClick={() => {
              resetMessages();
              clearPasswords();
              showView("login");
            }}
          >
            Iniciar sesión
          </button>
        )}
        {showLoginResendAction && (
          <button
            type="button"
            className="block w-full text-xs font-semibold"
            style={{ color: P.brnDk }}
            disabled={busy || !resendAllowed}
            onClick={() => {
              if (!busy && resendAllowed) void handleResendConfirmation();
            }}
          >
            {busy ? "Enviando…" : "Reenviar correo de confirmación"}
          </button>
        )}
        {view === "signup" && !showSignupExistsAction && (
          <button
            type="button"
            className="text-xs font-semibold"
            style={{ color: P.brnDk }}
            onClick={() => {
              resetMessages();
              showView("login");
            }}
          >
            Ya tengo una cuenta
          </button>
        )}
        {view === "login" && (
          <>
            <button
              type="button"
              className="block w-full text-xs font-semibold"
              style={{ color: P.brnDk }}
              onClick={() => {
                resetMessages();
                showView("signup");
              }}
            >
              Crear cuenta
            </button>
            <button
              type="button"
              className="block w-full text-xs font-medium"
              style={{ color: P.muted }}
              onClick={() => {
                resetMessages();
                showView("forgot");
              }}
            >
              ¿Olvidaste tu contraseña?
            </button>
          </>
        )}
        {(view === "forgot" || view === "confirm-email") && (
          <button
            type="button"
            className="text-xs font-semibold"
            style={{ color: P.brnDk }}
            onClick={() => {
              resetMessages();
              showView("login");
            }}
          >
            Volver a iniciar sesión
          </button>
        )}
      </div>
    </form>
  );
}
