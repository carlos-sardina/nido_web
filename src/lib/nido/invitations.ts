import { nidoErrorFromUnknown, nidoFail, nidoOk, type NidoResult } from "./errors";
import {
  buildInvitationUrl,
  generateInvitationToken,
  invitationEmailIssue,
  isInvitationTokenFormat,
  normalizeInviteEmail,
} from "./rules";
import { nidoClient, requireUser, type NidoClient } from "./session";
import { INVITATION_TTL_DAYS, type CreatedInvitation, type InvitationPreview, type InvitationStatus } from "./types";

const PREVIEW_STATUSES = new Set<InvitationStatus>([
  "valid",
  "expired",
  "accepted",
  "invalid",
]);

function asInvitationStatus(value: string | null | undefined): InvitationStatus {
  if (value && PREVIEW_STATUSES.has(value as InvitationStatus)) {
    return value as InvitationStatus;
  }
  return "invalid";
}

export async function createInvitation(
  input: { householdId: string; email?: string | null },
  supabase: NidoClient = nidoClient(),
): Promise<NidoResult<CreatedInvitation>> {
  const auth = await requireUser(supabase);
  if (auth.ok === false) return nidoFail(auth.error.code);

  const email = normalizeInviteEmail(input.email);
  const emailIssue = invitationEmailIssue({
    email: input.email,
    currentUserEmail: auth.data.user.email,
  });
  if (emailIssue) return nidoFail(emailIssue);

  const token = generateInvitationToken();
  const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { error } = await auth.data.supabase.from("household_invitations").insert({
    household_id: input.householdId,
    invited_by: auth.data.user.id,
    email,
    token,
    expires_at: expiresAt,
  });

  if (error) return nidoFail(nidoErrorFromUnknown(error).code);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return nidoOk({
    url: buildInvitationUrl(origin, token),
    expiresAt,
  });
}

export async function lookupInvitation(
  token: string,
  supabase: NidoClient = nidoClient(),
): Promise<NidoResult<InvitationPreview>> {
  if (!isInvitationTokenFormat(token)) {
    return nidoOk({ status: "invalid", householdName: null });
  }

  const { data, error } = await supabase.rpc("lookup_invitation", {
    p_token: token,
  });

  if (error) return nidoFail(nidoErrorFromUnknown(error).code);

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return nidoOk({ status: "invalid", householdName: null });

  return nidoOk({
    status: asInvitationStatus(row.status),
    householdName: row.household_name ?? null,
  });
}

export async function acceptInvitation(
  token: string,
  supabase: NidoClient = nidoClient(),
): Promise<NidoResult<{ householdId: string; householdName: string }>> {
  const auth = await requireUser(supabase);
  if (auth.ok === false) return nidoFail(auth.error.code);

  if (!isInvitationTokenFormat(token)) {
    return nidoFail("invitation_invalid");
  }

  const { data, error } = await auth.data.supabase.rpc("accept_invitation", {
    p_token: token,
  });

  if (error) return nidoFail(nidoErrorFromUnknown(error).code);
  if (!data) return nidoFail("network");

  return nidoOk({
    householdId: data.id,
    householdName: data.name,
  });
}
