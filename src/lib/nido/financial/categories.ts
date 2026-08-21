/**
 * Household expense category catalog and name rules.
 *
 * Categories are household-scoped. There is no global categories table.
 * Default names must stay in sync with public.default_expense_category_catalog().
 */

export const CATEGORY_NAME_MAX = 80;

export type DefaultExpenseCategory = {
  name: string;
  icon: string;
};

/**
 * Product catalog used when a Nido is created.
 * Source: EXP_CATS in src/lib/constants.ts, with truncated labels expanded.
 */
export const DEFAULT_EXPENSE_CATEGORIES: readonly DefaultExpenseCategory[] = [
  { name: "Vivienda", icon: "🏠" },
  { name: "Despensa", icon: "🛒" },
  { name: "Restaurantes", icon: "🍔" },
  { name: "Transporte", icon: "🚗" },
  { name: "Mascotas", icon: "🐶" },
  { name: "Servicios", icon: "⚡" },
  { name: "Limpieza", icon: "🧹" },
  { name: "Entretenimiento", icon: "🎬" },
  { name: "Salud", icon: "❤️" },
  { name: "Educación", icon: "🎓" },
  { name: "Trabajo", icon: "💼" },
  { name: "Otros", icon: "➕" },
];

function visibleLength(value: string): number {
  return Array.from(value).length;
}

export function normalizeCategoryName(name: string | null | undefined): string | null {
  const trimmed = name?.trim() ?? "";
  if (!trimmed) return null;
  if (visibleLength(trimmed) > CATEGORY_NAME_MAX) return null;
  return trimmed;
}

export function isDuplicateActiveCategoryName(
  name: string,
  existing: ReadonlyArray<{ name: string; archivedAt?: string | null }>,
): boolean {
  const normalized = normalizeCategoryName(name);
  if (!normalized) return false;
  const needle = normalized.toLowerCase();
  return existing.some(
    (row) =>
      row.archivedAt == null &&
      normalizeCategoryName(row.name)?.toLowerCase() === needle,
  );
}

export type HouseholdCategory = {
  id: string;
  householdId: string;
  name: string;
  icon: string | null;
  type: "income" | "expense";
  isDefault: boolean;
  archivedAt: string | null;
};

export function activeExpenseCategories(
  categories: readonly HouseholdCategory[],
  householdId: string,
): HouseholdCategory[] {
  return categories
    .filter(
      (category) =>
        category.householdId === householdId &&
        category.type === "expense" &&
        category.archivedAt == null,
    )
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}
