"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "lucide-react";
import { initialsFromName } from "@/lib/auth/identity";
import {
  canSubmitInvitationAction,
  formatInvitationDay,
} from "@/lib/nido/invitation-actions";
import { canShowInvitationQr, invitationDestination } from "@/lib/nido/invitation-qr";
import { cancelInvitation, createInvitation, listInvitations } from "@/lib/nido/invitations";
import { removeHouseholdMember, transferHouseholdOwnership } from "@/lib/nido/membership";
import { canSubmitRemove } from "@/lib/nido/remove-member";
import { removableMembers, transferableMembers } from "@/lib/nido/rules";
import { canSubmitTransfer } from "@/lib/nido/transfer-ownership";
import type { Household, HouseholdMember, HouseholdMemberView, ListedInvitation } from "@/lib/nido/types";
import { HouseholdCategoriesCard } from "@/components/household/HouseholdCategoriesCard";
import { HouseholdNameCard } from "@/components/household/HouseholdNameCard";
import { HouseholdSplitCard } from "@/components/household/HouseholdSplitCard";
import { InviteQrModal } from "@/components/flows/InviteQrModal";
import { Button } from "@/components/nido/Button";
import { ChoiceCard } from "@/components/nido/ChoiceCard";
import { PullToRefresh } from "@/components/nido/PullToRefresh";
import { BackLink } from "@/components/nido/Screen";
import { TextLink } from "@/components/nido/TextLink";
import { Heading, Text } from "@/components/nido/Typography";
import { P } from "@/lib/palette";

const LIST_STATUS_LABEL: Record<ListedInvitation["status"], string> = {
  pending: "Pendiente",
  accepted: "Aceptada",
  expired: "Expirada",
};

export function HouseholdScreen({
  household,
  membership,
  members,
  onClose,
  onOwnershipTransferred,
  onHouseholdUpdated,
  onRefresh,
}: {
  household: Household;
  membership: HouseholdMember;
  members: HouseholdMemberView[];
  onClose: () => void;
  onOwnershipTransferred: () => void;
  onHouseholdUpdated: (household: Household) => void;
  onRefresh: () => void | Promise<void>;
}) {
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [invitations, setInvitations] = useState<ListedInvitation[]>([]);
  const [invitationsLoading, setInvitationsLoading] = useState(false);
  const [invitationsError, setInvitationsError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [qrInvitation, setQrInvitation] = useState<ListedInvitation | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelSuccess, setCancelSuccess] = useState<string | null>(null);
  const [transferStep, setTransferStep] = useState<"idle" | "pick" | "confirm">("idle");
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [transferring, setTransferring] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [transferSuccess, setTransferSuccess] = useState<string | null>(null);
  const [confirmingRemoveUserId, setConfirmingRemoveUserId] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removeSuccess, setRemoveSuccess] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [categoryRefreshKey, setCategoryRefreshKey] = useState(0);
  const invitationsRef = useRef(invitations);
  invitationsRef.current = invitations;
  const householdRefreshInFlight = useRef(false);
  const isOwner = membership.role === "owner";
  const candidates = transferableMembers(members, membership.user_id);
  const removable = removableMembers(members, membership.user_id);
  const selectedTarget = candidates.find((member) => member.userId === selectedTargetId) ?? null;
  const memberLabel = members.length === 1 ? "1 miembro" : `${members.length} miembros`;

  const loadInvitations = useCallback(async (opts?: { silent?: boolean }) => {
    if (membership.role !== "owner") return;
    const silent = Boolean(opts?.silent && invitationsRef.current.length > 0);
    if (!silent) {
      setInvitationsLoading(true);
      setInvitationsError(null);
    }
    const result = await listInvitations();
    if (result.ok === false) {
      setInvitationsError(result.error.message);
      if (!silent) setInvitations([]);
      setInvitationsLoading(false);
      return;
    }
    setInvitationsError(null);
    setInvitations(result.data);
    setInvitationsLoading(false);
  }, [membership.role]);

  const handleRefresh = useCallback(async () => {
    if (householdRefreshInFlight.current) return;
    householdRefreshInFlight.current = true;
    setRefreshing(true);
    try {
      await onRefresh();
      await loadInvitations({ silent: true });
      setCategoryRefreshKey((value) => value + 1);
    } finally {
      setRefreshing(false);
      householdRefreshInFlight.current = false;
    }
  }, [loadInvitations, onRefresh]);

  useEffect(() => {
    void loadInvitations();
  }, [loadInvitations]);

  const copyInvitationUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch {
      return false;
    }
  };

  const handleInvite = async () => {
    setInviteBusy(true);
    setInviteError(null);
    setInviteCopied(false);
    const result = await createInvitation({ householdId: household.id });
    setInviteBusy(false);
    if (result.ok === false) {
      setInviteError(result.error.message);
      return;
    }
    setInviteCopied(await copyInvitationUrl(result.data.url));
    await loadInvitations();
  };

  const invitationOrigin = () => (typeof window !== "undefined" ? window.location.origin : "");

  const handleCopyLink = async (invitation: ListedInvitation) => {
    const url = invitationDestination(invitationOrigin(), invitation.token);
    const copied = await copyInvitationUrl(url);
    setCopiedId(copied ? invitation.id : null);
    if (!copied) setInviteError("No se pudo copiar el enlace.");
  };

  const handleShowQr = (invitation: ListedInvitation) => {
    if (!canShowInvitationQr(invitation.status)) return;
    setQrInvitation(invitation);
  };

  const handleConfirmCancel = async (invitationId: string) => {
    if (!canSubmitInvitationAction(cancelling)) return;
    setCancelling(true);
    setCancelError(null);
    const result = await cancelInvitation(invitationId);
    setCancelling(false);
    if (result.ok === false) {
      setCancelError(result.error.message);
      return;
    }
    setConfirmingId(null);
    setCancelSuccess("Invitación cancelada.");
    await loadInvitations();
  };

  const handleConfirmRemove = async (userId: string) => {
    if (!canSubmitRemove(removing)) return;
    setRemoving(true);
    setRemoveError(null);
    const result = await removeHouseholdMember(userId);
    setRemoving(false);
    if (result.ok === false) {
      setRemoveError(result.error.message);
      return;
    }
    const removed = members.find((member) => member.userId === userId);
    setConfirmingRemoveUserId(null);
    setRemoveSuccess(
      removed ? `${removed.displayName} ya no pertenece al Nido.` : "Integrante eliminado del Nido.",
    );
    await onRefresh();
  };

  return (
    <div className="absolute inset-0 z-30" style={{ backgroundColor: P.bgL }}>
      <PullToRefresh
        onRefresh={handleRefresh}
        refreshing={refreshing}
        className="h-full min-h-0 overflow-y-auto overscroll-contain [&::-webkit-scrollbar]:hidden pb-8"
      >
      <div className="px-6 pt-3 pb-1">
        <BackLink onClick={onClose} label="Cerrar" />
        <Heading as="h2" size="h2">
          Configuración
        </Heading>
        <Text size="caption" tone="muted" className="mt-1">
          {memberLabel}
        </Text>
      </div>
      <HouseholdNameCard household={household} onSaved={onHouseholdUpdated} />
      <div className="px-6 my-3 space-y-2">
        {removeSuccess && (
          <Text size="caption" tone="brand" role="status">{removeSuccess}</Text>
        )}
        {members.map((member) => {
          const canRemove = isOwner && removable.some((row) => row.userId === member.userId);
          const confirmingRemove = confirmingRemoveUserId === member.userId;
          return (
            <div key={member.userId} className="rounded-[1.5rem] p-4 shadow-sm space-y-3" style={{ backgroundColor: P.card }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold overflow-hidden" style={{ backgroundColor: P.sage }}>
                  {member.avatarUrl
                    ? <img src={member.avatarUrl} alt="" className="w-full h-full object-cover" />
                    : initialsFromName(member.displayName)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: P.text }}>{member.displayName}</p>
                  <p className="text-[10px]" style={{ color: P.muted }}>{member.role === "owner" ? "Propietario" : "Miembro"}</p>
                </div>
              </div>
              {canRemove && confirmingRemove ? (
                <div className="space-y-2">
                  <Text size="caption" className="leading-relaxed">
                    ¿Eliminar a {member.displayName} del Nido?
                  </Text>
                  <Text size="caption" tone="muted" className="leading-relaxed">
                    Dejará de ser miembro activo. Su historial se conservará.
                  </Text>
                  {removeError && (
                    <Text size="caption" tone="danger" role="alert">{removeError}</Text>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={removing}
                      onClick={() => {
                        if (removing) return;
                        setConfirmingRemoveUserId(null);
                        setRemoveError(null);
                      }}
                      className="flex-1 py-3 rounded-2xl text-xs font-semibold border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      style={{ borderColor: P.border, color: P.muted }}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      disabled={!canSubmitRemove(removing)}
                      onClick={() => { void handleConfirmRemove(member.userId); }}
                      className="flex-1 py-3 rounded-2xl text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      style={{ backgroundColor: P.danger, color: "#fff", opacity: removing ? 0.7 : 1 }}
                    >
                      {removing ? "Eliminando…" : "Eliminar"}
                    </button>
                  </div>
                </div>
              ) : canRemove ? (
                <TextLink
                  tone="muted"
                  onClick={() => {
                    setRemoveSuccess(null);
                    setRemoveError(null);
                    setConfirmingRemoveUserId(member.userId);
                  }}
                >
                  Eliminar
                </TextLink>
              ) : null}
            </div>
          );
        })}
      </div>
      <HouseholdSplitCard household={household} onSaved={onHouseholdUpdated} />
      <HouseholdCategoriesCard householdId={household.id} refreshKey={categoryRefreshKey} />
      {isOwner && (
        <div className="mx-6 mb-3">
          <button
            onClick={inviteBusy ? undefined : handleInvite}
            className="w-full flex items-center gap-3 p-4 rounded-[1.5rem] border text-left"
            style={{ borderColor: P.border, backgroundColor: P.card, opacity: inviteBusy ? 0.7 : 1 }}
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: P.sagePl }}>
              <Link size={16} style={{ color: P.sageDk }} />
            </div>
            <div className="flex-1">
              <p className="text-xs font-semibold" style={{ color: P.text }}>
                {inviteBusy ? "Generando enlace…" : inviteCopied ? "Enlace copiado" : "Invitar por enlace"}
              </p>
              <p className="text-[10px]" style={{ color: P.muted }}>Comparte este enlace con la persona que quieres invitar.</p>
            </div>
          </button>
          {inviteError && (
            <p className="text-[11px] mt-2" style={{ color: P.danger }}>{inviteError}</p>
          )}
        </div>
      )}
      {isOwner && (
        <div className="mx-6 mb-3 rounded-[1.5rem] p-4 space-y-3" style={{ backgroundColor: P.card }}>
          <Text size="label">Invitaciones</Text>
          {invitationsLoading && (
            <Text size="caption" tone="muted">Cargando invitaciones...</Text>
          )}
          {!invitationsLoading && invitationsError && (
            <Text size="caption" tone="danger" role="alert">{invitationsError}</Text>
          )}
          {!invitationsLoading && !invitationsError && invitations.length === 0 && (
            <Text size="caption" tone="muted">No hay invitaciones</Text>
          )}
          {cancelSuccess && (
            <Text size="caption" tone="brand" role="status">{cancelSuccess}</Text>
          )}
          {!invitationsLoading && invitations.map((invitation) => {
            const expiryLabel = formatInvitationDay(invitation.expiresAt);
            const createdLabel = formatInvitationDay(invitation.createdAt);
            return (
              <div key={invitation.id} className="rounded-2xl p-3 space-y-2" style={{ backgroundColor: P.sub }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold" style={{ color: P.text }}>
                      {LIST_STATUS_LABEL[invitation.status]}
                    </p>
                    {invitation.status === "pending" && expiryLabel && (
                      <p className="text-[10px]" style={{ color: P.muted }}>Expira el {expiryLabel}</p>
                    )}
                    {invitation.status === "expired" && expiryLabel && (
                      <p className="text-[10px]" style={{ color: P.muted }}>Expiró el {expiryLabel}</p>
                    )}
                    {invitation.status === "accepted" && createdLabel && (
                      <p className="text-[10px]" style={{ color: P.muted }}>Creada el {createdLabel}</p>
                    )}
                  </div>
                </div>
                {invitation.status === "pending" && confirmingId === invitation.id ? (
                  <div className="space-y-2">
                    <Text size="caption" className="leading-relaxed">¿Cancelar esta invitación?</Text>
                    <Text size="caption" tone="muted" className="leading-relaxed">
                      El enlace dejará de estar disponible.
                    </Text>
                    {cancelError && (
                      <Text size="caption" tone="danger" role="alert">{cancelError}</Text>
                    )}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={cancelling}
                        onClick={() => {
                          if (cancelling) return;
                          setConfirmingId(null);
                          setCancelError(null);
                        }}
                        className="flex-1 py-3 rounded-2xl text-xs font-semibold border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        style={{ borderColor: P.border, color: P.muted }}
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        disabled={!canSubmitInvitationAction(cancelling)}
                        onClick={() => { void handleConfirmCancel(invitation.id); }}
                        className="flex-1 py-3 rounded-2xl text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        style={{ backgroundColor: P.danger, color: "#fff", opacity: cancelling ? 0.7 : 1 }}
                      >
                        {cancelling ? "Cancelando…" : "Confirmar"}
                      </button>
                    </div>
                  </div>
                ) : invitation.status === "pending" ? (
                  <div className="flex flex-wrap gap-3">
                    <TextLink
                      onClick={() => { void handleCopyLink(invitation); }}
                    >
                      {copiedId === invitation.id ? "Enlace copiado" : "Copiar enlace"}
                    </TextLink>
                    {canShowInvitationQr(invitation.status) && (
                      <TextLink
                        onClick={() => { handleShowQr(invitation); }}
                      >
                        Mostrar QR
                      </TextLink>
                    )}
                    <TextLink
                      tone="muted"
                      onClick={() => {
                        setCancelSuccess(null);
                        setCancelError(null);
                        setConfirmingId(invitation.id);
                      }}
                    >
                      Cancelar
                    </TextLink>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
      {isOwner && candidates.length > 0 && (
        <div className="mx-6 mb-3 rounded-[1.5rem] p-4 space-y-3" style={{ backgroundColor: P.card }}>
          {transferStep === "idle" && (
            <>
              <Text size="label">Propiedad del Nido</Text>
              <Text size="caption" tone="muted" className="leading-relaxed">
                Solo el propietario puede invitar, eliminar integrantes y transferir la propiedad.
              </Text>
              {transferSuccess && (
                <Text size="caption" tone="brand" role="status">{transferSuccess}</Text>
              )}
              <TextLink
                onClick={() => {
                  setTransferError(null);
                  setTransferSuccess(null);
                  setSelectedTargetId(null);
                  setTransferStep("pick");
                }}
              >
                Transferir propiedad
              </TextLink>
            </>
          )}
          {transferStep === "pick" && (
            <>
              <Text size="label">¿A quién le transfieres la propiedad?</Text>
              <div className="space-y-2">
                {candidates.map((member) => (
                  <ChoiceCard
                    key={member.userId}
                    title={member.displayName}
                    description="Miembro activo"
                    selected={selectedTargetId === member.userId}
                    onClick={() => {
                      setSelectedTargetId(member.userId);
                      setTransferError(null);
                      setTransferStep("confirm");
                    }}
                  />
                ))}
              </div>
              <TextLink
                tone="muted"
                onClick={() => {
                  setTransferStep("idle");
                  setSelectedTargetId(null);
                }}
              >
                Cancelar
              </TextLink>
            </>
          )}
          {transferStep === "confirm" && selectedTarget && (
            <>
              <Text size="label">Confirmar transferencia</Text>
              <Text size="caption" tone="muted" className="leading-relaxed">
                {selectedTarget.displayName} pasará a ser propietario. Tú seguirás en el Nido como miembro.
              </Text>
              {transferError && (
                <Text size="caption" tone="danger" role="alert">{transferError}</Text>
              )}
              <Button
                loading={transferring}
                disabled={!canSubmitTransfer(transferring)}
                onClick={async () => {
                  if (!canSubmitTransfer(transferring)) return;
                  setTransferring(true);
                  setTransferError(null);
                  const result = await transferHouseholdOwnership(selectedTarget.userId);
                  setTransferring(false);
                  if (result.ok === false) {
                    setTransferError(result.error.message);
                    return;
                  }
                  setTransferSuccess(`Listo. ${selectedTarget.displayName} es el propietario.`);
                  setTransferStep("idle");
                  setSelectedTargetId(null);
                  onOwnershipTransferred();
                }}
              >
                {transferring ? "Transfiriendo…" : "Confirmar transferencia"}
              </Button>
              <TextLink
                tone="muted"
                disabled={transferring}
                onClick={() => {
                  if (transferring) return;
                  setTransferStep("pick");
                }}
              >
                Elegir a otra persona
              </TextLink>
            </>
          )}
        </div>
      )}
      {qrInvitation && canShowInvitationQr(qrInvitation.status) && (
        <InviteQrModal
          inviteUrl={invitationDestination(invitationOrigin(), qrInvitation.token)}
          nestName={household.name}
          onClose={() => setQrInvitation(null)}
        />
      )}
      </PullToRefresh>
    </div>
  );
}
