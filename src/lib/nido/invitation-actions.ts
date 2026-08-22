import { nidoErrorFromUnknown, nidoFail, nidoOk, type NidoResult } from "./errors.ts";
import { NIDO_TIMEZONE } from "./financial/dates.ts";
import { classifyInvitation } from "./rules.ts";
import type { InvitationListStatus, InvitationStatus, ListedInvitation } from "./types.ts";

export type InvitationListRow = {
  id: string;
  email: string | null;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
  token: string;
};

export type InvitationListAuth = {
  getUserId: () => Promise<string | null>;
  getActiveHouseholdId: () => Promise<string | null>;
  selectInvitations: (
    householdId: string,
  ) => Promise<{ data: InvitationListRow[] | null; error: unknown }>;
};

export type CancelInvitationAuth = {
  getUserId: () => Promise<string | null>;
  deleteInvitation: (
    invitationId: string,
  ) => Promise<{ data: Array<{ id: string }> | null; error: unknown }>;
};

/**
 * Display mapping only. Classification stays in classifyInvitation.
 * valid (unused + not expired) is shown as Pendiente.
 */
export function listStatusFromClassification(
  status: InvitationStatus,
): InvitationListStatus | null {
  if (status === "valid") return "pending";
  if (status === "accepted" || status === "expired") return status;
  return null;
}

export function formatInvitationDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "long",
    timeZone: NIDO_TIMEZONE,
  }).format(date);
}

export async function listInvitationsWithAuth(
  auth: InvitationListAuth,
  now: Date = new Date(),
): Promise<NidoResult<ListedInvitation[]>> {
  const userId = await auth.getUserId();
  if (!userId) return nidoFail("unauthenticated");

  const householdId = await auth.getActiveHouseholdId();
  if (!householdId) return nidoOk([]);

  const { data, error } = await auth.selectInvitations(householdId);
  if (error) return nidoFail(nidoErrorFromUnknown(error).code);

  const listed: ListedInvitation[] = [];
  for (const row of data ?? []) {
    const classified = classifyInvitation({
      found: true,
      expiresAt: row.expires_at,
      acceptedAt: row.accepted_at,
      now,
    });
    const status = listStatusFromClassification(classified);
    if (!status) continue;
    listed.push({
      id: row.id,
      email: row.email,
      expiresAt: row.expires_at,
      acceptedAt: row.accepted_at,
      createdAt: row.created_at,
      status,
      token: row.token,
    });
  }
  return nidoOk(listed);
}

/**
 * Cancel is a DELETE of invitation.id. household_id is never sent.
 * Authorization is RLS (active owner). Zero deleted rows is not success.
 */
export async function cancelInvitationWithAuth(
  invitationId: string,
  auth: CancelInvitationAuth,
): Promise<NidoResult<null>> {
  const userId = await auth.getUserId();
  if (!userId) return nidoFail("unauthenticated");

  const id = invitationId.trim();
  if (!id) return nidoFail("invitation_invalid");

  const { data, error } = await auth.deleteInvitation(id);
  if (error) return nidoFail(nidoErrorFromUnknown(error).code);
  if (!data || data.length === 0) return nidoFail("invitation_invalid");
  return nidoOk(null);
}

export function canSubmitInvitationAction(submitting: boolean): boolean {
  return !submitting;
}
