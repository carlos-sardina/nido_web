"use client";

import { useState } from "react";
import { Link } from "lucide-react";
import { initialsFromName } from "@/lib/auth/identity";
import { createInvitation } from "@/lib/nido/invitations";
import { transferHouseholdOwnership } from "@/lib/nido/membership";
import { transferableMembers } from "@/lib/nido/rules";
import { canSubmitTransfer } from "@/lib/nido/transfer-ownership";
import type { Household, HouseholdMember, HouseholdMemberView } from "@/lib/nido/types";
import { Button } from "@/components/nido/Button";
import { ChoiceCard } from "@/components/nido/ChoiceCard";
import { TextLink } from "@/components/nido/TextLink";
import { Text } from "@/components/nido/Typography";
import { C_CAP, C_INC, D_CAP, D_INC, T_CAP, T_INC, TOT_B } from "@/lib/constants";
import { $k } from "@/lib/helpers";
import { P } from "@/lib/palette";
import type { Model } from "@/lib/types";

export function HouseholdScreen({
  household,
  membership,
  members,
  model,
  setModel,
  onOwnershipTransferred,
}: {
  household: Household;
  membership: HouseholdMember;
  members: HouseholdMemberView[];
  model: Model;
  setModel: (m: Model) => void;
  onOwnershipTransferred: () => void;
}) {
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [transferStep, setTransferStep] = useState<"idle" | "pick" | "confirm">("idle");
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [transferring, setTransferring] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [transferSuccess, setTransferSuccess] = useState<string | null>(null);
  const isOwner = membership.role === "owner";
  const candidates = transferableMembers(members, membership.user_id);
  const selectedTarget = candidates.find((member) => member.userId === selectedTargetId) ?? null;
  const memberLabel = members.length === 1 ? "1 miembro" : `${members.length} miembros`;
  const shares = model === "equal" ? { d: 50, c: 50 }
    : model === "proportional" ? { d: Math.round(D_INC/T_INC*100), c: Math.round(C_INC/T_INC*100) }
    : { d: Math.round(D_CAP/T_CAP*100), c: Math.round(C_CAP/T_CAP*100) };

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
    setInviteUrl(result.data.url);
    try {
      await navigator.clipboard.writeText(result.data.url);
      setInviteCopied(true);
    } catch {
      setInviteCopied(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto [&::-webkit-scrollbar]:hidden">
      <div className="px-6 pt-3 pb-1">
        <h2 className="text-[22px] font-bold" style={{ fontFamily: "Fraunces, serif", color: P.text }}>{household.name}</h2>
        <p className="text-xs" style={{ color: P.muted }}>{memberLabel}</p>
      </div>
      <div className="px-6 my-3 space-y-2">
        {members.map((member) => (
          <div key={member.userId} className="rounded-[1.5rem] p-4 shadow-sm flex items-center gap-3" style={{ backgroundColor: P.card }}>
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
        ))}
      </div>
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
              <p className="text-[10px]" style={{ color: P.muted }}>Comparte un link. No se envía correo todavía.</p>
            </div>
          </button>
          {inviteUrl && (
            <p className="text-[10px] break-all mt-2 px-1" style={{ color: P.muted }}>{inviteUrl}</p>
          )}
          {inviteError && (
            <p className="text-[11px] mt-2" style={{ color: P.danger }}>{inviteError}</p>
          )}
        </div>
      )}
      {isOwner && candidates.length > 0 && (
        <div className="mx-6 mb-3 rounded-[1.5rem] p-4 space-y-3" style={{ backgroundColor: P.card }}>
          {transferStep === "idle" && (
            <>
              <Text size="label">Propiedad del Nido</Text>
              <Text size="caption" tone="muted" className="leading-relaxed">
                Solo el propietario puede invitar y transferir la propiedad.
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
      <div className="mx-6 mb-3 bg-white rounded-[1.5rem] p-5 shadow-sm">
        <h3 className="text-xs font-semibold mb-3" style={{ color: P.text }}>Modelo de aportación</h3>
        <p className="text-[10px] mb-3" style={{ color: P.muted }}>Los montos siguen siendo de demostración.</p>
        <div className="space-y-2 mb-5">
          {([
            { id: "equal" as Model,       label: "Por partes iguales",     sub: "50 / 50" },
            { id: "proportional" as Model,label: "Proporcional al ingreso", sub: `${Math.round(D_INC/T_INC*100)}% / ${Math.round(C_INC/T_INC*100)}%` },
            { id: "capacity" as Model,    label: "Capacidad de aportación",sub: "Recomendado", rec: true },
          ] as const).map(opt => (
            <button key={opt.id} onClick={() => setModel(opt.id)}
              className="w-full flex items-center justify-between p-3 rounded-2xl border-2 text-left transition-all"
              style={{ borderColor: model === opt.id ? P.brnDk : "transparent", backgroundColor: model === opt.id ? P.sagePl : P.sub }}>
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-full border-2 flex items-center justify-center"
                  style={{ borderColor: model === opt.id ? P.brnDk : P.brn }}>
                  {model === opt.id && <div className="w-2 h-2 rounded-full" style={{ backgroundColor: P.brnDk }} />}
                </div>
                <div>
                  <p className="text-xs font-semibold" style={{ color: P.text }}>{opt.label}</p>
                  <p className="text-[9px]" style={{ color: P.muted }}>{opt.sub}</p>
                </div>
              </div>
              {"rec" in opt && opt.rec && (
                <span className="text-[9px] font-bold rounded-full px-2 py-0.5" style={{ backgroundColor: P.brnDk, color: "#fff" }}>✦ IDEAL</span>
              )}
            </button>
          ))}
        </div>
        <h3 className="text-[9px] font-semibold uppercase tracking-wider mb-3" style={{ color: P.muted }}>Aportación mensual · {$k(TOT_B)}/mes</h3>
        {[{ name: "Persona A", share: shares.d, color: P.sage }, { name: "Persona B", share: shares.c, color: "#5A9E90" }].map(m => (
          <div key={m.name} className="mb-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium" style={{ color: P.text }}>{m.name}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold" style={{ color: P.text }}>{$k(Math.round(m.share/100*TOT_B))}</span>
                <span className="text-[9px] w-7 text-right" style={{ color: P.muted }}>{m.share}%</span>
              </div>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: P.sub }}>
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${m.share}%`, backgroundColor: m.color }} />
            </div>
          </div>
        ))}
        {model === "capacity" && (
          <div className="mt-3 rounded-2xl p-3 border" style={{ backgroundColor: "#E8F4EF", borderColor: `${P.sageLt}60` }}>
            <p className="text-[10px] font-semibold mb-1" style={{ color: P.sageDk }}>¿Por qué es más justo?</p>
            <p className="text-[10px] leading-relaxed" style={{ color: P.text }}>Calcula cuánto puede aportar cada persona <em>después</em> de cubrir sus compromisos personales fijos.</p>
          </div>
        )}
      </div>
    </div>
  );
}
