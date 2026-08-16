"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthPanel } from "@/components/auth/AuthPanel";
import { identityFromUser } from "@/lib/auth/identity";
import { clearPendingInvitationToken, savePendingInvitationToken } from "@/lib/auth/pending-flow";
import { useAuth } from "@/lib/auth/use-auth";
import { joinBlockReason, joinInvitationCopy } from "@/lib/nido/invitation-copy";
import { acceptInvitation, lookupInvitation } from "@/lib/nido/invitations";
import { getMyActiveHousehold, getMyMembership } from "@/lib/nido/membership";
import { isInvitationTokenFormat } from "@/lib/nido/rules";
import type { InvitationPreview } from "@/lib/nido/types";
import { canStartExclusiveAction } from "@/lib/onboarding/validation";
import { P } from "@/lib/palette";
import { NidoHouse } from "@/components/shared/NidoHouse";
import { OBtn2 } from "@/components/onboarding/OBtn2";

export function JoinInvitationScreen({ token }: { token: string }) {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const identity = identityFromUser(user);
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [alreadyInNido, setAlreadyInNido] = useState(false);
  const [activeHouseholdName, setActiveHouseholdName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      if (!isInvitationTokenFormat(token)) {
        if (!cancelled) {
          setPreview({ status: "invalid", householdName: null });
          setLoading(false);
        }
        return;
      }

      const lookedUp = await lookupInvitation(token);
      if (cancelled) return;
      if (lookedUp.ok === false) {
        setError(lookedUp.error.message);
        setPreview({ status: "invalid", householdName: null });
        setLoading(false);
        return;
      }
      setPreview(lookedUp.data);

      if (user) {
        const membership = await getMyMembership();
        if (cancelled) return;
        const hasActive = membership.ok && membership.data !== null;
        setAlreadyInNido(Boolean(hasActive));
        if (hasActive) {
          const household = await getMyActiveHousehold();
          if (cancelled) return;
          setActiveHouseholdName(household.ok ? household.data?.name ?? null : null);
        } else {
          setActiveHouseholdName(null);
        }
      } else {
        setAlreadyInNido(false);
        setActiveHouseholdName(null);
      }

      setLoading(false);
    }

    if (!authLoading) {
      void load();
    }

    return () => {
      cancelled = true;
    };
  }, [token, user, authLoading]);

  const block = joinBlockReason({
    alreadyInNido,
    activeHouseholdName,
    invitationHouseholdName: preview?.householdName ?? null,
  });
  const copy = joinInvitationCopy({ preview, block });
  const canAccept = Boolean(user && preview?.status === "valid" && block === "none");
  const joinPath = `/join/${encodeURIComponent(token)}`;

  const handleAccept = async () => {
    if (!canStartExclusiveAction(busy)) return;
    setBusy(true);
    setError(null);
    const result = await acceptInvitation(token);
    if (result.ok === false) {
      setError(result.error.message);
      setBusy(false);
      return;
    }
    clearPendingInvitationToken();
    router.replace("/");
  };

  return (
    <div className="relative min-h-screen flex flex-col overflow-hidden" style={{ backgroundColor: P.bgL, fontFamily: "Figtree, sans-serif" }}>
      <div className="flex-1 min-h-0 overflow-y-auto [&::-webkit-scrollbar]:hidden px-6 pt-8 pb-8 flex flex-col">
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <NidoHouse />
          <h1 className="text-3xl font-bold mt-4 mb-2" style={{ fontFamily: "Fraunces, serif", color: P.text }}>
            {authLoading || loading ? "Revisando invitación…" : copy.title}
          </h1>
          <p className="text-sm leading-relaxed mb-6" style={{ color: P.muted }}>
            {authLoading || loading ? "Un momento." : copy.body}
          </p>
          {user && identity?.email && (
            <p className="text-[11px] mb-4" style={{ color: P.muted }}>
              Conectado como <span className="font-semibold" style={{ color: P.text }}>{identity.email}</span>
            </p>
          )}
          {error && (
            <p className="text-[11px] mb-4 leading-relaxed" style={{ color: P.danger }}>
              {error}
            </p>
          )}
        </div>

        {!authLoading && !loading && (
          <div className="space-y-3">
            {!user && preview?.status === "valid" && (
              <AuthPanel
                nextPath={joinPath}
                onAttempt={() => {
                  savePendingInvitationToken(token);
                }}
                onAuthenticated={() => undefined}
                onEmailConfirmationPending={() => {
                  savePendingInvitationToken(token);
                }}
              />
            )}
            {canAccept && (
              <OBtn2
                label={busy ? "Aceptando invitación…" : "Aceptar invitación"}
                onClick={busy ? () => undefined : () => { void handleAccept(); }}
                disabled={busy}
              />
            )}
            <button
              type="button"
              onClick={() => router.replace("/")}
              className="w-full py-3 text-xs font-semibold"
              style={{ color: P.muted }}
            >
              Volver al inicio
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
