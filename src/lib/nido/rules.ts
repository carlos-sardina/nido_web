import type { HouseholdRole, InvitationStatus, MembershipStatus, NidoErrorCode } from "./types";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

export const HOUSEHOLD_NAME_MIN = 1;
export const HOUSEHOLD_NAME_MAX = 80;
export const DISPLAY_NAME_MIN = 1;
export const DISPLAY_NAME_MAX = 80;

export function classifyMemberships(
  rows: ReadonlyArray<{ left_at: string | null }>,
): MembershipStatus {
  if (rows.some((row) => row.left_at === null)) return "active";
  if (rows.length > 0) return "historical_only";
  return "no_nido";
}

export function hasActiveMembership(
  rows: ReadonlyArray<{ left_at: string | null }>,
): boolean {
  return classifyMemberships(rows) === "active";
}

export function canCreateOrJoinNido(
  rows: ReadonlyArray<{ left_at: string | null }>,
): NidoErrorCode | null {
  if (hasActiveMembership(rows)) return "already_in_nido";
  return null;
}

export function classifyInvitation(input: {
  found: boolean;
  expiresAt?: string | Date | null;
  acceptedAt?: string | Date | null;
  now?: Date;
}): InvitationStatus {
  if (!input.found) return "invalid";
  if (input.acceptedAt) return "accepted";

  const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
  if (!expiresAt || Number.isNaN(expiresAt.getTime())) return "invalid";

  const now = input.now ?? new Date();
  if (expiresAt.getTime() <= now.getTime()) return "expired";
  return "valid";
}

export function canLeaveHousehold(input: {
  isActiveMember: boolean;
  role: HouseholdRole | null;
  activeOwnerCount: number;
}): NidoErrorCode | null {
  if (!input.isActiveMember || !input.role) return "not_a_member";
  if (input.role === "owner" && input.activeOwnerCount <= 1) return "last_owner";
  return null;
}

export function canTransferOwnership(input: {
  actorUserId: string | null;
  actorRole: HouseholdRole | null;
  isActiveMember: boolean;
  targetUserId: string | null;
  targetIsActiveSameHousehold: boolean;
  targetRole: HouseholdRole | null;
}): NidoErrorCode | null {
  if (!input.actorUserId || !input.isActiveMember || !input.actorRole) {
    return "not_a_member";
  }
  if (input.actorRole !== "owner") return "forbidden";
  const targetId = input.targetUserId?.trim() ?? "";
  if (!targetId) return "invalid_transfer_target";
  if (targetId === input.actorUserId) return "cannot_transfer_to_self";
  if (!input.targetIsActiveSameHousehold) return "invalid_transfer_target";
  if (input.targetRole !== "member") return "invalid_transfer_target";
  return null;
}

export function transferableMembers<T extends { userId: string; role: HouseholdRole }>(
  members: ReadonlyArray<T>,
  actorUserId: string,
): T[] {
  return members.filter((member) => member.userId !== actorUserId && member.role === "member");
}

export function canRemoveMember(input: {
  actorUserId: string | null;
  actorRole: HouseholdRole | null;
  isActiveMember: boolean;
  targetUserId: string | null;
  targetIsActiveSameHousehold: boolean;
  targetRole: HouseholdRole | null;
}): NidoErrorCode | null {
  if (!input.actorUserId || !input.isActiveMember || !input.actorRole) {
    return "not_a_member";
  }
  if (input.actorRole !== "owner") return "forbidden";
  const targetId = input.targetUserId?.trim() ?? "";
  if (!targetId) return "invalid_remove_target";
  if (targetId === input.actorUserId) return "cannot_remove_self";
  if (!input.targetIsActiveSameHousehold) return "invalid_remove_target";
  if (input.targetRole !== "member") return "invalid_remove_target";
  return null;
}

export function removableMembers<T extends { userId: string; role: HouseholdRole }>(
  members: ReadonlyArray<T>,
  actorUserId: string,
): T[] {
  return members.filter((member) => member.userId !== actorUserId && member.role === "member");
}

export function applyOwnershipTransfer<T extends { userId: string; role: HouseholdRole }>(
  members: ReadonlyArray<T>,
  actorUserId: string,
  newOwnerId: string,
): T[] {
  return members.map((member) => {
    if (member.userId === actorUserId) return { ...member, role: "member" as const };
    if (member.userId === newOwnerId) return { ...member, role: "owner" as const };
    return member;
  });
}

function visibleLength(value: string): number {
  return Array.from(value).length;
}

export function normalizeHouseholdName(name: string | null | undefined): string | null {
  const trimmed = name?.trim() ?? "";
  if (visibleLength(trimmed) < HOUSEHOLD_NAME_MIN) return null;
  if (visibleLength(trimmed) > HOUSEHOLD_NAME_MAX) return null;
  return trimmed;
}

export function normalizeDisplayName(name: string | null | undefined): string | null {
  const trimmed = name?.trim() ?? "";
  if (visibleLength(trimmed) < DISPLAY_NAME_MIN) return null;
  if (visibleLength(trimmed) > DISPLAY_NAME_MAX) return null;
  return trimmed;
}

export function isInvitationTokenFormat(token: string): boolean {
  return TOKEN_PATTERN.test(token);
}

export function extractInvitationToken(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    const match = url.pathname.match(/\/join\/([^/]+)/);
    if (match?.[1]) {
      const token = decodeURIComponent(match[1]);
      return isInvitationTokenFormat(token) ? token : null;
    }
  } catch {
    // Not an absolute URL. Treat the whole value as a token.
  }

  const pathMatch = trimmed.match(/(?:^|\/)join\/([^/?#]+)/);
  if (pathMatch?.[1]) {
    const token = decodeURIComponent(pathMatch[1]);
    return isInvitationTokenFormat(token) ? token : null;
  }

  return isInvitationTokenFormat(trimmed) ? trimmed : null;
}

export function generateInvitationToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function buildInvitationPath(token: string): string {
  return `/join/${encodeURIComponent(token)}`;
}

export function buildInvitationUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}${buildInvitationPath(token)}`;
}
