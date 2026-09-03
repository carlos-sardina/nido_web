import { useRef, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { EmeraldHero, HeroKicker } from "@/components/nido/DecoratedCard";
import { PullToRefresh } from "@/components/nido/PullToRefresh";
import { TextLink } from "@/components/nido/TextLink";
import type { AuthIdentity } from "@/lib/auth/identity";
import { canSubmitLeave } from "@/lib/nido/leave-household";
import { leaveHousehold } from "@/lib/nido/membership";
import { canSubmitDisplayName, updateMyDisplayName } from "@/lib/nido/profile";
import type { HouseholdRole } from "@/lib/nido/types";
import { P } from "@/lib/palette";

type NameStatus = "idle" | "editing" | "saving" | "success" | "error";

export function ProfilePanel({
  identity,
  householdName,
  role,
  isLastOwner,
  hasOtherActiveMembers,
  onClose,
  onLogout,
  onLeft,
  onDisplayNameSaved,
  onRefresh,
  signingOut = false,
}: {
  identity: AuthIdentity | null;
  householdName: string;
  role: HouseholdRole;
  isLastOwner: boolean;
  hasOtherActiveMembers: boolean;
  onClose: () => void;
  onLogout: () => void;
  onLeft: () => void;
  onDisplayNameSaved: (displayName: string) => void;
  onRefresh: () => void | Promise<void>;
  signingOut?: boolean;
}) {
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const [nameStatus, setNameStatus] = useState<NameStatus>("idle");
  const [draftName, setDraftName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const savingRef = useRef(false);
  const refreshInFlight = useRef(false);

  const handleRefresh = async () => {
    if (refreshInFlight.current || nameStatus === "editing" || nameStatus === "saving") return;
    refreshInFlight.current = true;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
      refreshInFlight.current = false;
    }
  };

  const displayedName = identity?.displayName ?? "Usuario";
  const saving = nameStatus === "saving";
  const editing = nameStatus === "editing" || nameStatus === "saving" || nameStatus === "error";

  const startEdit = () => {
    setDraftName(identity?.displayName ?? "");
    setNameError(null);
    setNameStatus("editing");
  };

  const cancelEdit = () => {
    if (saving) return;
    setNameError(null);
    setNameStatus("idle");
  };

  const saveName = async () => {
    if (!canSubmitDisplayName(saving) || savingRef.current) return;
    savingRef.current = true;
    setNameStatus("saving");
    setNameError(null);
    const result = await updateMyDisplayName(draftName);
    savingRef.current = false;
    if (result.ok === false) {
      setNameError(result.error.message);
      setNameStatus("error");
      return;
    }
    onDisplayNameSaved(result.data.display_name);
    setDraftName(result.data.display_name);
    setNameStatus("success");
  };

  return (
    <div className="absolute inset-0 z-40 flex flex-col overflow-hidden" style={{ backgroundColor: P.bgL }}>
      <div className="relative z-10 flex shrink-0 items-center px-6 pt-[max(1rem,env(safe-area-inset-top))] pb-2" style={{ backgroundColor: P.bgL }}>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="w-9 h-9 rounded-full flex items-center justify-center active:scale-95 transition-transform"
          style={{ backgroundColor: P.sub }}
        >
          <ChevronLeft size={18} style={{ color: P.text }} />
        </button>
      </div>

      <PullToRefresh
        onRefresh={handleRefresh}
        refreshing={refreshing}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain [&::-webkit-scrollbar]:hidden pb-[var(--app-screen-bottom)]"
      >
        <h2
          className="px-6 pt-2 pb-3 text-sm font-bold"
          style={{ fontFamily: "Fraunces, serif", color: P.text }}
        >
          Mi perfil
        </h2>

        <div className="px-6 mb-5">
          <EmeraldHero>
            <HeroKicker>Tu lugar en el Nido</HeroKicker>
            <div className="flex items-center gap-3">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-lg font-bold overflow-hidden flex-shrink-0"
                style={{ backgroundColor: "rgba(255,255,255,0.12)" }}
              >
                {identity?.avatarUrl
                  ? <img src={identity.avatarUrl} alt="" className="w-full h-full object-cover" />
                  : (identity?.initials ?? "?")}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[22px] font-bold leading-tight break-words" style={{ fontFamily: "Fraunces, serif", color: "#FFFCFA" }}>
                  {displayedName}
                </p>
                <p className="text-[11px] mt-1 truncate" style={{ color: "rgba(255,255,255,0.55)" }}>
                  {identity?.email ?? ""}
                </p>
                <p className="text-[10px] font-semibold uppercase tracking-widest mt-1.5" style={{ color: "rgba(255,255,255,0.45)" }}>
                  {role === "owner" ? "Propietario" : "Miembro"} · {householdName}
                </p>
              </div>
            </div>
          </EmeraldHero>
        </div>

        <div className="px-6 mb-5">
          {editing ? (
            <div>
              <label htmlFor="profile-display-name" className="sr-only">Nombre</label>
              <input
                id="profile-display-name"
                type="text"
                autoComplete="name"
                value={draftName}
                disabled={saving}
                aria-invalid={nameStatus === "error" || undefined}
                aria-describedby={nameError ? "profile-display-name-error" : undefined}
                onChange={(event) => {
                  setDraftName(event.target.value);
                  if (nameStatus === "error") {
                    setNameError(null);
                    setNameStatus("editing");
                  }
                }}
                className="w-full h-12 px-4 rounded-2xl text-sm font-medium outline-none border-2"
                style={{
                  backgroundColor: P.card,
                  color: P.text,
                  borderColor: nameStatus === "error" ? P.danger : P.border,
                }}
              />
              {nameError && (
                <p id="profile-display-name-error" className="text-[11px] mt-2" role="alert" style={{ color: P.danger }}>
                  {nameError}
                </p>
              )}
              <div className="flex gap-2 mt-3">
                <button
                  type="button"
                  onClick={cancelEdit}
                  disabled={saving}
                  className="flex-1 py-3 rounded-2xl text-xs font-semibold border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  style={{ borderColor: P.border, color: P.muted, opacity: saving ? 0.7 : 1 }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void saveName()}
                  disabled={!canSubmitDisplayName(saving)}
                  className="flex-1 py-3 rounded-2xl text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  style={{ backgroundColor: P.sage, color: "#fff", opacity: saving ? 0.7 : 1 }}
                >
                  {saving ? "Guardando…" : "Guardar"}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <TextLink
                className="px-0 min-h-9"
                onClick={startEdit}
              >
                Editar nombre
              </TextLink>
              {nameStatus === "success" && (
                <p className="text-[11px] mt-1" role="status" style={{ color: P.sage }}>
                  Nombre actualizado
                </p>
              )}
            </div>
          )}
        </div>

        {/* Leave + logout */}
        <div className="px-6 space-y-3">
          {!confirmLeave ? (
            <button
              onClick={() => { setLeaveError(null); setConfirmLeave(true); }}
              className="w-full py-3.5 rounded-2xl text-sm font-semibold border transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              style={{ color: P.text, borderColor: P.border, backgroundColor: P.card }}
            >
              Salir del Nido
            </button>
          ) : isLastOwner ? (
            <div className="rounded-2xl p-4 border" style={{ borderColor: P.border, backgroundColor: P.card }}>
              <p className="text-xs mb-3 leading-relaxed" style={{ color: P.muted }}>
                {hasOtherActiveMembers
                  ? "No puedes salir siendo el propietario. Transfiere la propiedad a otro miembro desde Configuración y después podrás salir."
                  : "No puedes salir siendo el único miembro del Nido. Invita a alguien y transfiere la propiedad antes de salir."}
              </p>
              <button
                onClick={() => setConfirmLeave(false)}
                className="w-full py-3 rounded-2xl text-xs font-semibold border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                style={{ borderColor: P.border, color: P.muted }}
              >
                Entendido
              </button>
            </div>
          ) : (
            <div className="rounded-2xl p-4 border" style={{ borderColor: P.border, backgroundColor: P.card }}>
              <p className="text-xs mb-3 leading-relaxed" style={{ color: P.muted }}>
                Salir no borra el historial. Seguirás viendo lo que registraste en este Nido.
              </p>
              {leaveError && (
                <p className="text-[11px] mb-3" role="alert" style={{ color: P.danger }}>{leaveError}</p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmLeave(false)}
                  className="flex-1 py-3 rounded-2xl text-xs font-semibold border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  style={{ borderColor: P.border, color: P.muted }}
                >
                  Cancelar
                </button>
                <button
                  onClick={async () => {
                    if (!canSubmitLeave(leaving)) return;
                    setLeaving(true);
                    setLeaveError(null);
                    const result = await leaveHousehold();
                    setLeaving(false);
                    if (result.ok === false) {
                      setLeaveError(result.error.message);
                      return;
                    }
                    onLeft();
                  }}
                  disabled={!canSubmitLeave(leaving)}
                  className="flex-1 py-3 rounded-2xl text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  style={{ backgroundColor: P.dangerBg, color: P.danger, opacity: leaving ? 0.7 : 1 }}
                >
                  {leaving ? "Saliendo…" : "Confirmar"}
                </button>
              </div>
            </div>
          )}
          <button onClick={signingOut ? undefined : onLogout}
            disabled={signingOut}
            className="w-full py-3.5 rounded-2xl text-sm font-semibold border transition-all active:scale-[0.98]"
            style={{ color: P.danger, borderColor: `${P.danger}30`, backgroundColor: P.dangerBg, opacity: signingOut ? 0.7 : 1, cursor: signingOut ? "not-allowed" : "pointer" }}>
            {signingOut ? "Cerrando sesión…" : "Cerrar sesión"}
          </button>
        </div>
      </PullToRefresh>
    </div>
  );
}
