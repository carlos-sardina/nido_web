import type { Tables } from "@/lib/supabase/types";
import type { PersonalVisibility } from "./personal-visibility";
import type { HouseholdSplitMethod } from "./split-method";

export type { HouseholdSplitMethod, PersonalVisibility };

export type Household = Tables<"households">;
export type SavingsBalance = Tables<"savings_balances">;
export type HouseholdMember = Tables<"household_members">;
export type HouseholdInvitation = Tables<"household_invitations">;
export type Profile = Tables<"profiles">;
export type HouseholdRole = HouseholdMember["role"];

export type MembershipStatus = "no_nido" | "active" | "historical_only";

export type InvitationStatus = "valid" | "expired" | "accepted" | "invalid";

export type InvitationListStatus = "pending" | "accepted" | "expired";

export type InvitationPreview = {
  status: InvitationStatus;
  householdName: string | null;
};

export type CreatedInvitation = {
  url: string;
  expiresAt: string;
};

export type ListedInvitation = {
  id: string;
  /** Historical schema column. Nido does not create or send email invitations. */
  email: string | null;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
  status: InvitationListStatus;
  /** Owner-only via RLS. Used to rebuild the join URL. Do not render. */
  token: string;
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
  profile: Pick<Profile, "id" | "display_name" | "avatar_url" | "personal_visibility"> | null;
  historicalCount: number;
};

export const INVITATION_TTL_DAYS = 7;

export type NidoErrorCode =
  | "unauthenticated"
  | "already_in_nido"
  | "already_member"
  | "invalid_name"
  | "invitation_invalid"
  | "invitation_expired"
  | "invitation_accepted"
  | "invite_pending"
  | "not_a_member"
  | "last_owner"
  | "cannot_transfer_to_self"
  | "invalid_transfer_target"
  | "forbidden"
  | "invalid_amount"
  | "invalid_description"
  | "invalid_category"
  | "invalid_split"
  | "invalid_visibility"
  | "invalid_date"
  | "expense_not_found"
  | "expense_deleted"
  | "expense_has_refunds"
  | "goal_not_found"
  | "goal_archived"
  | "contribution_not_found"
  | "contribution_deleted"
  | "income_not_found"
  | "income_deleted"
  | "budget_not_found"
  | "budget_deleted"
  | "recurrence_not_found"
  | "recurrence_inactive"
  | "recurrence_not_due"
  | "recurrence_requires_review"
  | "conflict"
  | "network";
