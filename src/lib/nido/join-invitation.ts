import { isFallbackDisplayName } from "../auth/identity.ts";
import { nidoFail, nidoOk, type NidoResult } from "./errors.ts";
import { isInvitationTokenFormat, normalizeDisplayName } from "./rules.ts";

export type JoinInvitationAuth = {
  getUserId: () => Promise<string | null>;
  getUserEmail: () => Promise<string | null>;
  getProfileDisplayName: () => Promise<NidoResult<string | null>>;
  updateDisplayName: (name: string) => Promise<NidoResult<{ id: string; display_name: string }>>;
  acceptInvitation: (
    token: string,
  ) => Promise<NidoResult<{ householdId: string; householdName: string }>>;
};

export type JoinDisplayNameDecision =
  | { kind: "skip" }
  | { kind: "persist"; displayName: string }
  | { kind: "need_name" };

export function joinDisplayNameDecision(input: {
  enteredName?: string | null;
  currentDisplayName: string | null | undefined;
  email: string | null | undefined;
}): JoinDisplayNameDecision {
  if (
    !isFallbackDisplayName({
      displayName: input.currentDisplayName,
      email: input.email,
    })
  ) {
    return { kind: "skip" };
  }

  const normalized = normalizeDisplayName(input.enteredName);
  if (!normalized) return { kind: "need_name" };
  return { kind: "persist", displayName: normalized };
}

export async function completeJoinInvitationWithAuth(
  input: { token: string; enteredName?: string | null },
  auth: JoinInvitationAuth,
): Promise<
  NidoResult<{
    householdId: string;
    householdName: string;
    persistedDisplayName: string | null;
  }>
> {
  const userId = await auth.getUserId();
  if (!userId) return nidoFail("unauthenticated");

  if (!isInvitationTokenFormat(input.token)) {
    return nidoFail("invitation_invalid");
  }

  const profileName = await auth.getProfileDisplayName();
  if (profileName.ok === false) return profileName;

  const email = await auth.getUserEmail();
  const decision = joinDisplayNameDecision({
    enteredName: input.enteredName,
    currentDisplayName: profileName.data,
    email,
  });

  if (decision.kind === "need_name") {
    return nidoFail("invalid_name", "Ingresa el nombre que verán los demás miembros.");
  }

  let persistedDisplayName: string | null = null;
  if (decision.kind === "persist") {
    const updated = await auth.updateDisplayName(decision.displayName);
    if (updated.ok === false) return updated;
    persistedDisplayName = updated.data.display_name;
  }

  const accepted = await auth.acceptInvitation(input.token);
  if (accepted.ok === false) return accepted;

  return nidoOk({
    householdId: accepted.data.householdId,
    householdName: accepted.data.householdName,
    persistedDisplayName,
  });
}
