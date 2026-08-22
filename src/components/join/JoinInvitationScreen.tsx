"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthPanel } from "@/components/auth/AuthPanel";
import { identityFromUser, isFallbackDisplayName } from "@/lib/auth/identity";
import { clearPendingInvitationToken, savePendingInvitationToken } from "@/lib/auth/pending-flow";
import { useAuth } from "@/lib/auth/use-auth";
import {
  invitationPreviewStatusFromAcceptError,
  joinBlockFromAcceptError,
  joinInvitationCopy,
  type JoinBlockReason,
} from "@/lib/nido/invitation-copy";
import { completeJoinInvitation, lookupInvitation } from "@/lib/nido/invitations";
import { getMyProfile } from "@/lib/nido/profile";
import { isInvitationTokenFormat } from "@/lib/nido/rules";
import type { InvitationPreview } from "@/lib/nido/types";
import { canStartExclusiveAction, validateDisplayName } from "@/lib/onboarding/validation";
import { Button } from "@/components/nido/Button";
import { Field, FieldError, FieldLabel, HelperText, TextInput } from "@/components/nido/Field";
import { FlowScreen, ScreenIntro } from "@/components/nido/Screen";
import { TextLink } from "@/components/nido/TextLink";
import { NidoHouse } from "@/components/shared/NidoHouse";

export function JoinInvitationScreen({ token }: { token: string }) {
  const router = useRouter();
  const ids = useId();
  const { user, status, isLoading: authLoading } = useAuth();
  const sessionUser = status === "authenticated" ? user : null;
  const identity = identityFromUser(sessionUser);
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [profileDisplayName, setProfileDisplayName] = useState<string | null>(null);
  const [enteredName, setEnteredName] = useState("");
  const [loading, setLoading] = useState(true);
  const [block, setBlock] = useState<JoinBlockReason>("none");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  const needsName = Boolean(
    sessionUser &&
    isFallbackDisplayName({
      displayName: profileDisplayName,
      email: identity?.email ?? sessionUser.email,
    }),
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      setBlock("none");

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
        const profile = await getMyProfile();
        if (cancelled) return;
        if (profile.ok === false) {
          setError(profile.error.message);
          setProfileDisplayName(null);
        } else {
          setProfileDisplayName(profile.data?.display_name ?? null);
        }
      } else {
        setProfileDisplayName(null);
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

  const copy = joinInvitationCopy({ preview, block });
  const canAccept = Boolean(sessionUser && preview?.status === "valid" && block === "none");
  const joinPath = `/join/${encodeURIComponent(token)}`;
  const waiting = authLoading || loading;
  const nameReady = !needsName || Boolean(enteredName.trim());

  const handleAccept = async () => {
    if (!canStartExclusiveAction(busy) || busyRef.current) return;
    if (!canAccept) return;

    if (needsName) {
      const invalid = validateDisplayName(enteredName);
      if (invalid) {
        setNameError(invalid);
        return;
      }
    }

    busyRef.current = true;
    setBusy(true);
    setError(null);
    setNameError(null);

    const result = await completeJoinInvitation({
      token,
      enteredName: needsName ? enteredName : undefined,
    });

    if (result.ok === false) {
      const nextBlock = joinBlockFromAcceptError(result.error.code);
      const nextStatus = invitationPreviewStatusFromAcceptError(result.error.code);
      if (nextBlock) setBlock(nextBlock);
      if (nextStatus) {
        setPreview((current) => ({
          status: nextStatus,
          householdName: current?.householdName ?? null,
        }));
      }
      if (!nextBlock && !nextStatus) {
        setError(result.error.message);
      }
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
        {!waiting && canAccept && needsName && (
          <Field className="mt-6 w-full text-left">
            <FieldLabel htmlFor={`${ids}-join-name`}>Tu nombre</FieldLabel>
            <TextInput
              id={`${ids}-join-name`}
              placeholder="Diana"
              autoComplete="name"
              value={enteredName}
              filled={Boolean(enteredName.trim())}
              invalid={Boolean(nameError)}
              aria-describedby={nameError ? `${ids}-join-name-error` : undefined}
              onChange={(event) => {
                setEnteredName(event.target.value);
                if (nameError) setNameError(null);
              }}
            />
            <HelperText>Este es el nombre que verán los demás miembros de tu Nido.</HelperText>
            {nameError && (
              <FieldError id={`${ids}-join-name-error`}>{nameError}</FieldError>
            )}
          </Field>
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
            disabled={busy || !nameReady}
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
