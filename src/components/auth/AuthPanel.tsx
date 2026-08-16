"use client";

import { useState } from "react";
import {
  publicAuthErrorMessage,
  RECOVERY_SENT_MESSAGE,
  validateLoginInput,
  validateRecoveryEmail,
  validateSignupInput,
} from "@/lib/auth/credentials";
import {
  requestPasswordReset,
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
}: {
  initialView?: Exclude<AuthView, "confirm-email">;
  nextPath?: string;
  onAuthenticated: () => void;
  onEmailConfirmationPending?: () => void;
}) {
  const [view, setView] = useState<AuthView>(initialView);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const resetMessages = () => {
    setError(null);
    setInfo(null);
  };

  const handleSignup = async () => {
    resetMessages();
    const invalid = validateSignupInput({ email, password, confirmPassword });
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    try {
      const { data, error: signUpError } = await signUpWithPassword(email, password, {
        next: nextPath,
      });
      if (signUpError) {
        setError(publicAuthErrorMessage("signup"));
        return;
      }
      if (data.session) {
        setPassword("");
        setConfirmPassword("");
        onAuthenticated();
        return;
      }
      onEmailConfirmationPending?.();
      setView("confirm-email");
    } catch {
      setError(publicAuthErrorMessage("signup"));
    } finally {
      setBusy(false);
    }
  };

  const handleLogin = async () => {
    resetMessages();
    const invalid = validateLoginInput({ email, password });
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    try {
      const { error: signInError } = await signInWithPassword(email, password);
      if (signInError) {
        setError(publicAuthErrorMessage("login"));
        return;
      }
      setPassword("");
      onAuthenticated();
    } catch {
      setError(publicAuthErrorMessage("login"));
    } finally {
      setBusy(false);
    }
  };

  const handleRecovery = async () => {
    resetMessages();
    const invalid = validateRecoveryEmail(email);
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    try {
      await requestPasswordReset(email);
      setInfo(RECOVERY_SENT_MESSAGE);
    } catch {
      setError(publicAuthErrorMessage("recovery"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="w-full text-left"
      onSubmit={(event) => {
        event.preventDefault();
        if (busy) return;
        if (view === "signup") void handleSignup();
        else if (view === "login") void handleLogin();
        else if (view === "forgot") void handleRecovery();
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
        <p className="text-sm leading-relaxed mb-4" style={{ color: P.muted }}>
          Revisa tu correo y confirma la cuenta antes de continuar. No estás
          autenticado todavía y no se creó un Nido.
        </p>
      )}

      {error && (
        <p className="text-[11px] mb-3 leading-relaxed" style={{ color: P.danger }}>
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

      <div className="mt-4 space-y-2 text-center">
        {view === "signup" && (
          <button
            type="button"
            className="text-xs font-semibold"
            style={{ color: P.brnDk }}
            onClick={() => {
              resetMessages();
              setView("login");
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
                setView("signup");
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
                setView("forgot");
              }}
            >
              ¿Olvidaste tu contraseña?
            </button>
          </>
        )}
        {view === "forgot" && (
          <button
            type="button"
            className="text-xs font-semibold"
            style={{ color: P.brnDk }}
            onClick={() => {
              resetMessages();
              setView("login");
            }}
          >
            Volver a iniciar sesión
          </button>
        )}
      </div>
    </form>
  );
}
