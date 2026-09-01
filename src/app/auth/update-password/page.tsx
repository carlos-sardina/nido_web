"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { validateNewPassword } from "@/lib/auth/credentials";
import { classifyAuthError, logAuthFailure } from "@/lib/auth/errors";
import { RECOVERY_LINK_INVALID_MESSAGE } from "@/lib/auth/recovery";
import { updatePassword } from "@/lib/auth/session";
import { useAuth } from "@/lib/auth/use-auth";
import { Button } from "@/components/nido/Button";
import { Field, FieldError, FieldLabel, PasswordInput } from "@/components/nido/Field";
import { FlowScreen, ScreenIntro } from "@/components/nido/Screen";
import { TextLink } from "@/components/nido/TextLink";

export default function UpdatePasswordPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const ids = useId();
  const passwordId = `${ids}-password`;
  const confirmId = `${ids}-confirm`;
  const errorId = `${ids}-error`;
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async () => {
    setError(null);
    const invalid = validateNewPassword({ password, confirmPassword });
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    try {
      const { error: updateError } = await updatePassword(password);
      if (updateError) {
        const classified = classifyAuthError(updateError, "update-password");
        logAuthFailure(classified);
        setError(classified.message);
        return;
      }
      setPassword("");
      setConfirmPassword("");
      router.replace("/");
    } catch (error) {
      const classified = classifyAuthError(error, "update-password");
      logAuthFailure(classified);
      setError(classified.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <FlowScreen constrained>
      <div className="flex-1 flex flex-col justify-center">
        <ScreenIntro
          className="mb-8"
          title="Nueva contraseña"
          description="Elige una contraseña para tu cuenta."
        />

        {isLoading ? (
          <p className="text-body-sm text-muted-foreground">Cargando…</p>
        ) : !user ? (
          <div className="space-y-6">
            <FieldError>{RECOVERY_LINK_INVALID_MESSAGE}</FieldError>
            <Button onClick={() => router.replace("/")}>Volver al inicio</Button>
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!busy) void handleSubmit();
            }}
          >
            <Field>
              <FieldLabel htmlFor={passwordId}>Contraseña</FieldLabel>
              <PasswordInput
                id={passwordId}
                autoComplete="new-password"
                value={password}
                filled={Boolean(password)}
                aria-describedby={error ? errorId : undefined}
                onChange={(event) => setPassword(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={confirmId}>Confirmar contraseña</FieldLabel>
              <PasswordInput
                id={confirmId}
                autoComplete="new-password"
                value={confirmPassword}
                filled={Boolean(confirmPassword)}
                aria-describedby={error ? errorId : undefined}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </Field>
            {error && <FieldError id={errorId}>{error}</FieldError>}
            <Button type="submit" loading={busy} disabled={busy}>
              {busy ? "Guardando…" : "Guardar contraseña"}
            </Button>
            <div className="flex justify-center">
              <TextLink tone="muted" onClick={() => router.replace("/")}>
                Volver al inicio
              </TextLink>
            </div>
          </form>
        )}
      </div>
    </FlowScreen>
  );
}
