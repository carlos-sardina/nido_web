import type { User } from "@supabase/supabase-js";

/**
 * Display identity derived from the authenticated Supabase Auth user.
 *
 * This is NOT a `profiles` row. The database trigger `handle_new_user`
 * creates the profile. Onboarding may later persist `profiles.display_name`.
 * Prefer that column over Auth metadata when a profile is loaded.
 */
export type AuthIdentity = {
  email: string | null;
  displayName: string;
  avatarUrl: string | null;
  initials: string;
  firstName: string;
};

function firstNonEmptyString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
  }
  return null;
}

function firstLetter(token: string): string {
  const first = Array.from(token)[0];
  return first ? first.toLocaleUpperCase("es") : "";
}

export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return firstLetter(parts[0]);
  return `${firstLetter(parts[0])}${firstLetter(parts[parts.length - 1])}`;
}

export function emailLocalPart(email: string | null | undefined): string | null {
  const trimmed = firstNonEmptyString(email);
  if (!trimmed || !trimmed.includes("@")) return null;
  const local = trimmed.split("@")[0]?.trim() ?? "";
  return local || null;
}

/**
 * True when `display_name` is missing or still the `handle_new_user` /
 * `identityFromUser` email local-part fallback. A chosen name that happens
 * to equal the local-part is treated as fallback so join can ask again.
 */
export function isFallbackDisplayName(input: {
  displayName: string | null | undefined;
  email: string | null | undefined;
}): boolean {
  const name = input.displayName?.trim() ?? "";
  if (!name) return true;
  const local = emailLocalPart(input.email);
  if (!local) return false;
  return name === local;
}

export function identityFromUser(user: User | null | undefined): AuthIdentity | null {
  if (!user) return null;

  const meta = user.user_metadata ?? {};
  const email = firstNonEmptyString(user.email);
  const displayName =
    firstNonEmptyString(meta.full_name, meta.name, meta.display_name, email?.split("@")[0]) ??
    "Usuario";
  const avatarUrl = firstNonEmptyString(meta.avatar_url, meta.picture);
  const firstName = displayName.split(/\s+/).filter(Boolean)[0] ?? displayName;

  return {
    email,
    displayName,
    avatarUrl,
    initials: initialsFromName(displayName),
    firstName,
  };
}

export function applyProfileDisplayName(
  identity: AuthIdentity | null,
  displayName: string | null | undefined,
): AuthIdentity | null {
  if (!identity) return null;
  const trimmed = displayName?.trim();
  if (!trimmed) return identity;
  const firstName = trimmed.split(/\s+/).filter(Boolean)[0] ?? trimmed;
  return {
    ...identity,
    displayName: trimmed,
    firstName,
    initials: initialsFromName(trimmed),
  };
}
