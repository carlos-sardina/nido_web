import { nidoErrorFromUnknown, nidoFail, nidoOk, type NidoResult } from "./errors";
import { todayIso } from "./financial/dates";
import { createIncome } from "./incomes";
import {
  cancelInvitationWithAuth,
  listInvitationsWithAuth,
} from "./invitation-actions";
import { completeJoinInvitationWithAuth } from "./join-invitation";
import { getMyMembership } from "./membership";
import { getMyProfile, updateMyDisplayName } from "./profile";
import { fetchActiveIncomeCategories } from "./queries/categories";
import {
  buildInvitationUrl,
  generateInvitationToken,
  isInvitationTokenFormat,
} from "./rules";
import { nidoClient, requireUser, type NidoClient } from "./session";
import {
  INVITATION_TTL_DAYS,
  type CreatedInvitation,
  type InvitationPreview,
  type InvitationStatus,
  type ListedInvitation,
} from "./types";

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
  input: { householdId: string },
  supabase: NidoClient = nidoClient(),
): Promise<NidoResult<CreatedInvitation>> {
  const auth = await requireUser(supabase);
  if (auth.ok === false) return nidoFail(auth.error.code);

  const token = generateInvitationToken();
  const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { error } = await auth.data.supabase.from("household_invitations").insert({
    household_id: input.householdId,
    invited_by: auth.data.user.id,
    // Historical column. Nido does not create or send email invitations.
    email: null,
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

export async function listInvitations(
  supabase: NidoClient = nidoClient(),
): Promise<NidoResult<ListedInvitation[]>> {
  const auth = await requireUser(supabase);
  if (auth.ok === false) return nidoFail(auth.error.code);

  return listInvitationsWithAuth({
    getUserId: async () => auth.data.user.id,
    getActiveHouseholdId: async () => {
      const membership = await getMyMembership(auth.data.supabase);
      if (membership.ok === false) return null;
      return membership.data?.household_id ?? null;
    },
    selectInvitations: async (householdId) => {
      const result = await auth.data.supabase
        .from("household_invitations")
        .select("id, email, expires_at, accepted_at, created_at, token")
        .eq("household_id", householdId)
        .order("created_at", { ascending: false });
      return { data: result.data, error: result.error };
    },
  });
}

export async function cancelInvitation(
  invitationId: string,
  supabase: NidoClient = nidoClient(),
): Promise<NidoResult<null>> {
  const auth = await requireUser(supabase);
  if (auth.ok === false) return nidoFail(auth.error.code);

  return cancelInvitationWithAuth(invitationId, {
    getUserId: async () => auth.data.user.id,
    deleteInvitation: async (id) => {
      const result = await auth.data.supabase
        .from("household_invitations")
        .delete()
        .eq("id", id)
        .select("id");
      return { data: result.data, error: result.error };
    },
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

export async function completeJoinInvitation(
  input: { token: string; enteredName?: string | null; incomeAmount?: number | null },
  supabase: NidoClient = nidoClient(),
): Promise<
  NidoResult<{
    householdId: string;
    householdName: string;
    persistedDisplayName: string | null;
    persistedIncomeId: string | null;
  }>
> {
  const auth = await requireUser(supabase);
  if (auth.ok === false) return nidoFail(auth.error.code);

  return completeJoinInvitationWithAuth(input, {
    getUserId: async () => auth.data.user.id,
    getUserEmail: async () => auth.data.user.email ?? null,
    getProfileDisplayName: async () => {
      const profile = await getMyProfile(auth.data.supabase);
      if (profile.ok === false) return nidoFail(profile.error.code);
      return nidoOk(profile.data?.display_name ?? null);
    },
    updateDisplayName: (name) => updateMyDisplayName(name, auth.data.supabase),
    acceptInvitation: (token) => acceptInvitation(token, auth.data.supabase),
    listIncomeCategories: async (householdId) => {
      const result = await fetchActiveIncomeCategories(householdId, auth.data.supabase);
      if (result.ok === false) return result;
      return nidoOk(result.data.map((row) => ({ id: row.id, name: row.name })));
    },
    createIncome: (request) => createIncome(request, auth.data.supabase),
    todayIso: () => todayIso(),
  });
}
