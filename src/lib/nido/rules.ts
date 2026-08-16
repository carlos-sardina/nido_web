import type { HouseholdRole, InvitationStatus, MembershipStatus, NidoErrorCode } from "./types";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

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

export function normalizeHouseholdName(name: string | null | undefined): string | null {
  const trimmed = name?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeInviteEmail(email: string | null | undefined): string | null {
  if (email == null) return null;
  const normalized = email.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export function isInviteEmailValid(email: string): boolean {
  return email.includes("@") && !email.includes(" ") && email.length >= 3;
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
