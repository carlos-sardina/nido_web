import type { Tables } from "@/lib/supabase/types";

export type Household = Tables<"households">;
export type HouseholdMember = Tables<"household_members">;
export type HouseholdInvitation = Tables<"household_invitations">;
export type Profile = Tables<"profiles">;
export type HouseholdRole = HouseholdMember["role"];

export type MembershipStatus = "no_nido" | "active" | "historical_only";

export type InvitationStatus = "valid" | "expired" | "accepted" | "invalid";

export type InvitationPreview = {
  status: InvitationStatus;
  householdName: string | null;
};

export type CreatedInvitation = {
  url: string;
  expiresAt: string;
};

export type HouseholdMemberView = {
  userId: string;
  role: HouseholdRole;
  joinedAt: string;
  displayName: string;
  avatarUrl: string | null;
};

export type MyNidoState = {
  status: MembershipStatus;
  household: Household | null;
  membership: HouseholdMember | null;
  members: HouseholdMemberView[];
  profile: Pick<Profile, "id" | "display_name" | "avatar_url"> | null;
  historicalCount: number;
};

export const INVITATION_TTL_DAYS = 7;

export type NidoErrorCode =
  | "unauthenticated"
  | "already_in_nido"
  | "already_member"
  | "invalid_name"
  | "invalid_email"
  | "self_invite"
  | "invitation_invalid"
  | "invitation_expired"
  | "invitation_accepted"
  | "invite_pending"
  | "not_a_member"
  | "last_owner"
  | "forbidden"
  | "invalid_amount"
  | "invalid_description"
  | "invalid_category"
  | "invalid_split"
  | "invalid_date"
  | "expense_not_found"
  | "expense_deleted"
  | "goal_not_found"
  | "goal_archived"
  | "contribution_not_found"
  | "contribution_deleted"
  | "income_not_found"
  | "income_deleted"
  | "conflict"
  | "network";
