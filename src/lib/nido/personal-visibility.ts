export const PERSONAL_VISIBILITIES = ["nido", "private"] as const;

export type PersonalVisibility = (typeof PERSONAL_VISIBILITIES)[number];

export const DEFAULT_PERSONAL_VISIBILITY: PersonalVisibility = "nido";

export function isPersonalVisibility(value: unknown): value is PersonalVisibility {
  return value === "nido" || value === "private";
}

/**
 * Whether a viewer may read another person's personal finance row.
 * Shared / Nido rows are not personal and ignore this setting.
 * The owner always reads their own rows, including `private`.
 */
export function canReadPersonalFinance(input: {
  ownerId: string;
  viewerId: string | null | undefined;
  visibility: PersonalVisibility;
}): boolean {
  if (!input.viewerId) return false;
  if (input.ownerId === input.viewerId) return true;
  return input.visibility === "nido";
}

export function isPersonalExpenseVisible(input: {
  scope: "personal" | "shared";
  ownerId: string;
  viewerId: string | null | undefined;
  visibility: PersonalVisibility;
}): boolean {
  if (input.scope === "shared") return true;
  return canReadPersonalFinance(input);
}

export function isPersonalBudgetVisible(input: {
  memberId: string | null;
  viewerId: string | null | undefined;
  visibility: PersonalVisibility;
}): boolean {
  if (input.memberId == null) return true;
  return canReadPersonalFinance({
    ownerId: input.memberId,
    viewerId: input.viewerId,
    visibility: input.visibility,
  });
}

export function isPersonalSavingsVisible(input: {
  memberId: string | null;
  viewerId: string | null | undefined;
  visibility: PersonalVisibility;
}): boolean {
  return isPersonalBudgetVisible(input);
}
