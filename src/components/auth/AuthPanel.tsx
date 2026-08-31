"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  CONFIRM_EMAIL_BACK_TO_LOGIN,
  CONFIRM_EMAIL_HAS_ACCOUNT_PROMPT,
  CONFIRM_EMAIL_INTRO,
  CONFIRM_EMAIL_NEXT_STEP,
  RECOVERY_SENT_MESSAGE,
  confirmEmailDisplayAddress,
  leaveConfirmEmailView,
  normalizeEmail,
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
  canAttemptEmailSend,
  emailCooldownCountdownLabel,
  emailCooldownRetryHint,
  getRemainingCooldown,
  startCooldown,
} from "@/lib/auth/email-cooldown";
import {
  requestPasswordReset,
  resendSignupConfirmation,
  signInWithPassword,
  signUpWithPassword,
} from "@/lib/auth/session";
import { Button } from "@/components/nido/Button";
import { Field, FieldError, FieldLabel, HelperText, PasswordInput, TextInput } from "@/components/nido/Field";
import { TextLink } from "@/components/nido/TextLink";
import { Text } from "@/components/nido/Typography";

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
  const [, setCooldownTick] = useState(0);
  const [failureCode, setFailureCode] = useState<AuthFailureCode | null>(null);
  const ids = useId();
  const emailId = `${ids}-email`;
  const passwordId = `${ids}-password`;
  const confirmId = `${ids}-confirm`;
  const messageId = `${ids}-message`;

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

  const beginEmailCooldown = (action: "confirmation" | "recovery", address: string) => {
    startCooldown(action, address);
    setCooldownTick((tick) => tick + 1);
  };

  const confirmationRemaining = getRemainingCooldown("confirmation", email);
  const recoveryRemaining = getRemainingCooldown("recovery", email);
  const showSignupExistsAction = view === "signup" && failureCode === "already_registered";
  const showLoginResendAction = view === "login" && failureCode === "email_not_confirmed";
  const confirmationCooldownActive =
    (view === "confirm-email" || showLoginResendAction) && confirmationRemaining > 0;
  const recoveryCooldownActive = view === "forgot" && recoveryRemaining > 0;
  const cooldownActive = confirmationCooldownActive || recoveryCooldownActive;

  useEffect(() => {
    if (!cooldownActive) return;
    const timer = window.setInterval(() => setCooldownTick((tick) => tick + 1), 1_000);
    return () => window.clearInterval(timer);
  }, [cooldownActive]);

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
      const normalized = normalizeEmail(email);
      setEmail(normalized);
      clearPasswords();
      beginEmailCooldown("confirmation", normalized);
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
    const invalid = validateRecoveryEmail(email);
    if (invalid) {
      resetMessages();
      setError(invalid);
      return;
    }
    if (!canAttemptEmailSend("recovery", email, { inFlight: busyRef.current })) return;
    resetMessages();
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
      beginEmailCooldown("recovery", email);
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
    if (!canAttemptEmailSend("confirmation", email, { inFlight: busyRef.current })) return;
    resetMessages();
    if (!beginExclusive()) return;
    try {
      const { error: resendError } = await resendSignupConfirmation(email, {
        next: nextPath,
      });
      const outcome = interpretResendResponse(resendError);
      if (outcome.kind === "error") {
        logAuthFailure(outcome.error);
        setFailureCode(outcome.error.code);
        setError(outcome.error.message);
        return;
      }
      beginEmailCooldown("confirmation", email);
      setInfo(outcome.message);
    } catch (error) {
      const outcome = interpretResendResponse(error);
      if (outcome.kind === "error") {
        logAuthFailure(outcome.error);
        setFailureCode(outcome.error.code);
        setError(outcome.error.message);
        return;
      }
      beginEmailCooldown("confirmation", email);
      setInfo(outcome.message);
    } finally {
      endExclusive();
    }
  };

  const submitLabel =
    view === "signup" ? (busy ? "Creando cuenta…" : "Crear cuenta")
      : view === "login" ? (busy ? "Entrando…" : "Iniciar sesión")
        : view === "forgot"
          ? busy
            ? "Enviando…"
            : recoveryRemaining > 0
              ? emailCooldownCountdownLabel("Enviar", recoveryRemaining)
              : "Enviar enlace"
          : busy
            ? "Enviando…"
            : confirmationRemaining > 0
              ? emailCooldownCountdownLabel("Reenviar", confirmationRemaining)
              : "Reenviar correo";

  const submitDisabled =
    busy ||
    (view === "forgot" && recoveryRemaining > 0) ||
    (view === "confirm-email" && confirmationRemaining > 0);

  return (
    <form
      className="w-full text-left"
      onSubmit={(event) => {
        event.preventDefault();
        if (busy || busyRef.current) return;
        if (view === "signup") void handleSignup();
        else if (view === "login") void handleLogin();
        else if (view === "forgot") void handleRecovery();
        else if (view === "confirm-email") void handleResendConfirmation();
      }}
    >
      <div className="space-y-4">
        {view !== "confirm-email" && (
          <Field>
            <FieldLabel htmlFor={emailId}>Correo</FieldLabel>
            <TextInput
              id={emailId}
              type="email"
              autoComplete="email"
              placeholder="tu@correo.com"
              value={email}
              filled={Boolean(email)}
              invalid={Boolean(error) && !email.trim()}
              aria-describedby={error || info ? messageId : undefined}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>
        )}

        {(view === "signup" || view === "login") && (
          <Field>
            <FieldLabel htmlFor={passwordId}>Contraseña</FieldLabel>
            <PasswordInput
              id={passwordId}
              autoComplete={view === "signup" ? "new-password" : "current-password"}
              placeholder="Contraseña"
              value={password}
              filled={Boolean(password)}
              aria-describedby={error || info ? messageId : undefined}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>
        )}

        {view === "signup" && (
          <Field>
            <FieldLabel htmlFor={confirmId}>Confirmar contraseña</FieldLabel>
            <PasswordInput
              id={confirmId}
              autoComplete="new-password"
              placeholder="Repite la contraseña"
              value={confirmPassword}
              filled={Boolean(confirmPassword)}
              aria-describedby={error || info ? messageId : undefined}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </Field>
        )}

        {view === "confirm-email" && (
          <div className="text-center space-y-3">
            <Text size="body-sm" tone="muted" className="leading-relaxed">
              {CONFIRM_EMAIL_INTRO}
            </Text>
            <Text size="body-sm" className="font-semibold">
              {confirmEmailDisplayAddress(email)}
            </Text>
            <Text size="body-sm" tone="muted" className="leading-relaxed">
              {CONFIRM_EMAIL_NEXT_STEP}
            </Text>
            <HelperText>¿No recibiste el correo?</HelperText>
          </div>
        )}

        {error && <FieldError id={messageId}>{error}</FieldError>}
        {info && (
          <Text id={error ? undefined : messageId} size="caption" className="leading-relaxed">
            {info}
          </Text>
        )}
        {view === "forgot" && recoveryRemaining > 0 && (
          <HelperText>{emailCooldownRetryHint(recoveryRemaining)}</HelperText>
        )}

        <Button type="submit" loading={busy} disabled={submitDisabled}>
          {submitLabel}
        </Button>
      </div>

      <div className="mt-6 flex flex-col items-center gap-1">
        {showSignupExistsAction && (
          <TextLink
            onClick={() => {
              resetMessages();
              clearPasswords();
              showView("login");
            }}
          >
            Iniciar sesión
          </TextLink>
        )}
        {showLoginResendAction && (
          <TextLink
            disabled={busy || confirmationRemaining > 0}
            onClick={() => {
              if (!busy && confirmationRemaining <= 0) void handleResendConfirmation();
            }}
          >
            {busy
              ? "Enviando…"
              : confirmationRemaining > 0
                ? emailCooldownCountdownLabel("Reenviar", confirmationRemaining)
                : "Reenviar correo de confirmación"}
          </TextLink>
        )}
        {view === "signup" && !showSignupExistsAction && (
          <TextLink
            onClick={() => {
              resetMessages();
              showView("login");
            }}
          >
            Ya tengo una cuenta
          </TextLink>
        )}
        {view === "login" && (
          <>
            <TextLink
              onClick={() => {
                resetMessages();
                showView("signup");
              }}
            >
              Crear cuenta
            </TextLink>
            <TextLink
              tone="muted"
              onClick={() => {
                resetMessages();
                showView("forgot");
              }}
            >
              ¿Olvidaste tu contraseña?
            </TextLink>
          </>
        )}
        {view === "confirm-email" && (
          <div className="flex flex-col items-center gap-1">
            <Text size="caption" tone="muted">
              {CONFIRM_EMAIL_HAS_ACCOUNT_PROMPT}
            </Text>
            <TextLink
              onClick={() => {
                const next = leaveConfirmEmailView(email);
                resetMessages();
                setEmail(next.email);
                showView(next.view);
              }}
            >
              {CONFIRM_EMAIL_BACK_TO_LOGIN}
            </TextLink>
          </div>
        )}
        {view === "forgot" && (
          <TextLink
            onClick={() => {
              resetMessages();
              showView("login");
            }}
          >
            Volver a iniciar sesión
          </TextLink>
        )}
      </div>
    </form>
  );
}
