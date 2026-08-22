export const HOUSEHOLD_SPLIT_METHODS = ["equal", "proportional"] as const;

export type HouseholdSplitMethod = (typeof HOUSEHOLD_SPLIT_METHODS)[number];

export function isHouseholdSplitMethod(value: unknown): value is HouseholdSplitMethod {
  return value === "equal" || value === "proportional";
}
