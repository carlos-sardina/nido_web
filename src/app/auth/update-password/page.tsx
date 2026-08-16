"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { validateNewPassword } from "@/lib/auth/credentials";
import { classifyAuthError, logAuthFailure } from "@/lib/auth/errors";
import { updatePassword } from "@/lib/auth/session";
import { useAuth } from "@/lib/auth/use-auth";
import { P } from "@/lib/palette";
import { OBtn2 } from "@/components/onboarding/OBtn2";

export default function UpdatePasswordPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
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
    <div
      className="min-h-screen flex flex-col px-6 py-8"
      style={{ backgroundColor: P.bgL, fontFamily: "Figtree, sans-serif" }}
    >
      <div className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full">
        <h1 className="text-3xl font-bold mb-2" style={{ fontFamily: "Fraunces, serif", color: P.text }}>
          Nueva contraseña
        </h1>
        <p className="text-xs mb-6" style={{ color: P.muted }}>
          Elige una contraseña para tu cuenta.
        </p>

        {isLoading ? (
          <p className="text-sm" style={{ color: P.muted }}>Cargando…</p>
        ) : !user ? (
          <>
            <p className="text-sm leading-relaxed mb-6" style={{ color: P.danger }}>
              Este enlace no es válido o ya expiró. Solicita uno nuevo desde la pantalla de inicio.
            </p>
            <OBtn2 label="Volver al inicio" onClick={() => router.replace("/")} />
          </>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!busy) void handleSubmit();
            }}
          >
            <label className="text-xs font-semibold mb-2 block" style={{ color: P.muted }}>
              Contraseña
            </label>
            <input
              type="password"
              autoComplete="new-password"
              className="w-full py-3.5 px-4 rounded-2xl text-sm font-semibold border-2 outline-none mb-3"
              style={{ backgroundColor: P.card, borderColor: password ? P.brnDk : P.sub, color: P.text }}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
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
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
            {error && (
              <p className="text-[11px] mb-3 leading-relaxed" style={{ color: P.danger }}>
                {error}
              </p>
            )}
            <OBtn2
              label={busy ? "Guardando…" : "Guardar contraseña"}
              onClick={() => undefined}
              disabled={busy}
            />
          </form>
        )}
      </div>
    </div>
  );
}
