"use client";

import { useEffect, useRef, useState } from "react";
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
import { Button } from "@/components/nido/Button";
import { FieldError, HelperText } from "@/components/nido/Field";
import { FlowScreen, ScreenIntro } from "@/components/nido/Screen";
import { TextLink } from "@/components/nido/TextLink";
import { NidoHouse } from "@/components/shared/NidoHouse";

export function JoinInvitationScreen({ token }: { token: string }) {
  const router = useRouter();
  const { user, status, isLoading: authLoading } = useAuth();
  const sessionUser = status === "authenticated" ? user : null;
  const identity = identityFromUser(sessionUser);
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [alreadyInNido, setAlreadyInNido] = useState(false);
  const [activeHouseholdId, setActiveHouseholdId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
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

      if (sessionUser) {
        const membership = await getMyMembership();
        if (cancelled) return;
        const hasActive = membership.ok && membership.data !== null;
        setAlreadyInNido(Boolean(hasActive));
        if (hasActive) {
          const household = await getMyActiveHousehold();
          if (cancelled) return;
          setActiveHouseholdId(household.ok ? household.data?.id ?? null : null);
        } else {
          setActiveHouseholdId(null);
        }
      } else {
        setAlreadyInNido(false);
        setActiveHouseholdId(null);
      }

      setLoading(false);
    }

    if (!authLoading) {
      void load();
    }

    return () => {
      cancelled = true;
    };
  }, [token, sessionUser, authLoading]);

  const block = joinBlockReason({
    alreadyInNido,
    activeHouseholdId,
    invitationHouseholdId: null,
  });
  const copy = joinInvitationCopy({ preview, block });
  const canAccept = Boolean(sessionUser && preview?.status === "valid" && block === "none");
  const joinPath = `/join/${encodeURIComponent(token)}`;
  const waiting = authLoading || loading;

  const handleAccept = async () => {
    if (!canStartExclusiveAction(busy) || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    const result = await acceptInvitation(token);
    if (result.ok === false) {
      setError(result.error.message);
      busyRef.current = false;
      setBusy(false);
      return;
    }
    clearPendingInvitationToken();
    router.replace("/");
  };

  return (
    <FlowScreen>
      <div className="flex-1 flex flex-col items-center justify-center text-center">
        <NidoHouse />
        <ScreenIntro
          className="mt-6"
          align="center"
          title={waiting ? "Revisando invitación…" : copy.title}
          description={waiting ? "Un momento." : copy.body}
        />
        {sessionUser && identity?.email && (
          <HelperText className="mt-4">
            Conectado como <span className="font-semibold text-foreground">{identity.email}</span>
          </HelperText>
        )}
        {error && (
          <div className="mt-4 w-full">
            <FieldError>{error}</FieldError>
          </div>
        )}
      </div>

      <div className="space-y-3 mt-8">
        {!waiting && !sessionUser && preview?.status === "valid" && (
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
        {!waiting && canAccept && (
          <Button
            loading={busy}
            disabled={busy}
            onClick={() => { void handleAccept(); }}
          >
            {busy ? "Aceptando invitación…" : "Aceptar invitación"}
          </Button>
        )}
        <div className="flex justify-center">
          <TextLink tone="muted" onClick={() => router.replace("/")}>
            Volver al inicio
          </TextLink>
        </div>
      </div>
    </FlowScreen>
  );
}
