import type { InvitationPreview } from "./types";

export type JoinBlockReason = "none" | "already_in_other" | "already_in_this";

export function joinInvitationCopy(input: {
  preview: InvitationPreview | null;
  block: JoinBlockReason;
}): { title: string; body: string } {
  const { preview, block } = input;

  if (!preview || preview.status === "invalid") {
    return {
      title: "Invitación no válida",
      body: "Este enlace no corresponde a una invitación activa.",
    };
  }
  if (preview.status === "expired") {
    return {
      title: "Invitación expirada",
      body: preview.householdName
        ? `La invitación a ${preview.householdName} ya expiró.`
        : "Esta invitación ya expiró.",
    };
  }
  if (preview.status === "accepted") {
    return {
      title: "Invitación ya usada",
      body: preview.householdName
        ? `Alguien ya aceptó la invitación a ${preview.householdName}.`
        : "Esta invitación ya fue aceptada.",
    };
  }
  if (block === "already_in_this") {
    return {
      title: "Ya perteneces a este Nido",
      body: preview.householdName
        ? `Ya formas parte de ${preview.householdName}.`
        : "Ya formas parte de este Nido.",
    };
  }
  if (block === "already_in_other") {
    return {
      title: "Ya tienes un Nido",
      body: "Solo puedes pertenecer a un Nido a la vez. Sal de tu Nido actual antes de unirte a otro.",
    };
  }
  return {
    title: preview.householdName ? `Únete a ${preview.householdName}` : "Únete a un Nido",
    body: "Te invitaron a compartir este Nido.",
  };
}

export function joinBlockReason(input: {
  alreadyInNido: boolean;
  activeHouseholdId?: string | null;
  invitationHouseholdId?: string | null;
}): JoinBlockReason {
  if (!input.alreadyInNido) return "none";
  const active = input.activeHouseholdId?.trim() ?? "";
  const invited = input.invitationHouseholdId?.trim() ?? "";
  if (active && invited && active === invited) return "already_in_this";
  return "already_in_other";
}
