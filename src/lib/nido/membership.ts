import { nidoErrorFromUnknown, nidoFail, nidoOk, type NidoResult } from "./errors";
import { classifyMemberships } from "./rules";
import { nidoClient, requireUser, type NidoClient } from "./session";
import type {
  Household,
  HouseholdMember,
  HouseholdMemberView,
  MyNidoState,
  Profile,
} from "./types";

type MemberRow = HouseholdMember & {
  profiles:
    | Pick<Profile, "id" | "display_name" | "avatar_url">
    | Pick<Profile, "id" | "display_name" | "avatar_url">[]
    | null;
};

function profileFromEmbed(
  embedded: MemberRow["profiles"],
  userId: string,
): Pick<Profile, "id" | "display_name" | "avatar_url"> {
  const profile = Array.isArray(embedded) ? embedded[0] : embedded;
  return {
    id: profile?.id ?? userId,
    display_name: profile?.display_name?.trim() || "Miembro",
    avatar_url: profile?.avatar_url ?? null,
  };
}

export async function getMyMembership(
  supabase: NidoClient = nidoClient(),
): Promise<NidoResult<HouseholdMember | null>> {
  const auth = await requireUser(supabase);
  if (auth.ok === false) return nidoFail(auth.error.code);

  const { data, error } = await auth.data.supabase
    .from("household_members")
    .select("id, household_id, user_id, role, joined_at, left_at, created_at")
    .eq("user_id", auth.data.user.id)
    .is("left_at", null)
    .maybeSingle();

  if (error) return nidoFail(nidoErrorFromUnknown(error).code);
  return nidoOk(data);
}

export async function getMyActiveHousehold(
  supabase: NidoClient = nidoClient(),
): Promise<NidoResult<Household | null>> {
  const membership = await getMyMembership(supabase);
  if (membership.ok === false) return nidoFail(membership.error.code);
  if (!membership.data) return nidoOk(null);

  const { data, error } = await supabase
    .from("households")
    .select("id, name, created_by, created_at, updated_at")
    .eq("id", membership.data.household_id)
    .maybeSingle();

  if (error) return nidoFail(nidoErrorFromUnknown(error).code);
  return nidoOk(data);
}

export async function getHouseholdMembers(
  householdId: string,
  supabase: NidoClient = nidoClient(),
): Promise<NidoResult<HouseholdMemberView[]>> {
  const auth = await requireUser(supabase);
  if (auth.ok === false) return nidoFail(auth.error.code);

  const { data, error } = await auth.data.supabase
    .from("household_members")
    .select("id, household_id, user_id, role, joined_at, left_at, created_at, profiles(id, display_name, avatar_url)")
    .eq("household_id", householdId)
    .is("left_at", null)
    .order("joined_at", { ascending: true });

  if (error) return nidoFail(nidoErrorFromUnknown(error).code);

  const members = ((data ?? []) as MemberRow[]).map((row) => {
    const profile = profileFromEmbed(row.profiles, row.user_id);
    return {
      userId: row.user_id,
      role: row.role,
      joinedAt: row.joined_at,
      displayName: profile.display_name,
      avatarUrl: profile.avatar_url,
    };
  });

  return nidoOk(members);
}

export async function getMyNidoState(
  supabase: NidoClient = nidoClient(),
): Promise<NidoResult<MyNidoState>> {
  const auth = await requireUser(supabase);
  if (auth.ok === false) return nidoFail(auth.error.code);

  const { user } = auth.data;

  const [profileRes, membershipsRes] = await Promise.all([
    auth.data.supabase
      .from("profiles")
      .select("id, display_name, avatar_url")
      .eq("id", user.id)
      .maybeSingle(),
    auth.data.supabase
      .from("household_members")
      .select("id, household_id, user_id, role, joined_at, left_at, created_at")
      .eq("user_id", user.id),
  ]);

  if (profileRes.error) return nidoFail(nidoErrorFromUnknown(profileRes.error).code);
  if (membershipsRes.error) return nidoFail(nidoErrorFromUnknown(membershipsRes.error).code);

  const memberships = membershipsRes.data ?? [];
  const status = classifyMemberships(memberships);
  const active = memberships.find((row) => row.left_at === null) ?? null;
  const historicalCount = memberships.filter((row) => row.left_at !== null).length;

  if (!active) {
    return nidoOk({
      status,
      household: null,
      membership: null,
      members: [],
      profile: profileRes.data,
      historicalCount,
    });
  }

  const [householdRes, membersRes] = await Promise.all([
    getMyActiveHousehold(auth.data.supabase),
    getHouseholdMembers(active.household_id, auth.data.supabase),
  ]);

  if (householdRes.ok === false) return nidoFail(householdRes.error.code);
  if (membersRes.ok === false) return nidoFail(membersRes.error.code);
  if (!householdRes.data) return nidoFail("network");

  return nidoOk({
    status: "active",
    household: householdRes.data,
    membership: active,
    members: membersRes.data,
    profile: profileRes.data,
    historicalCount,
  });
}

export async function leaveHousehold(
  supabase: NidoClient = nidoClient(),
): Promise<NidoResult<null>> {
  const auth = await requireUser(supabase);
  if (auth.ok === false) return nidoFail(auth.error.code);

  const { error } = await auth.data.supabase.rpc("leave_household");
  if (error) return nidoFail(nidoErrorFromUnknown(error).code);
  return nidoOk(null);
}
