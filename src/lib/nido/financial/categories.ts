/**
 * Household expense category catalog and name rules.
 *
 * Categories are household-scoped. There is no global categories table.
 * Default names must stay in sync with public.default_expense_category_catalog()
 * and public.default_income_category_catalog().
 */

export const CATEGORY_NAME_MAX = 80;

export type DefaultExpenseCategory = {
  name: string;
  icon: string;
};

/**
 * Product catalog used when a Nido is created.
 * Must stay in sync with public.default_expense_category_catalog().
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

export const SUELDO_INCOME_CATEGORY_NAME = "Sueldo";
export const EXTRA_INCOME_CATEGORY_NAME = "Extra";

/**
 * Product catalog used when a Nido is created.
 * Must stay in sync with public.default_income_category_catalog().
 * Income is a fixed pair: Sueldo (recurring) and Extra (one-time events).
 */
export const DEFAULT_INCOME_CATEGORIES: readonly DefaultExpenseCategory[] = [
  { name: SUELDO_INCOME_CATEGORY_NAME, icon: "💰" },
  { name: EXTRA_INCOME_CATEGORY_NAME, icon: "✨" },
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

export function categoryNameKey(name: string | null | undefined): string | null {
  const normalized = normalizeCategoryName(name);
  return normalized ? normalized.toLowerCase() : null;
}

export function isDuplicateCategoryName(
  name: string,
  existing: ReadonlyArray<{ name: string }>,
): boolean {
  const needle = categoryNameKey(name);
  if (!needle) return false;
  return existing.some((row) => categoryNameKey(row.name) === needle);
}

export function isDuplicateActiveCategoryName(
  name: string,
  existing: ReadonlyArray<{ name: string; archivedAt?: string | null }>,
): boolean {
  return isDuplicateCategoryName(
    name,
    existing.filter((row) => row.archivedAt == null),
  );
}

export function findArchivedCategoryByNormalizedName<
  T extends { name: string; archivedAt?: string | null },
>(name: string, existing: ReadonlyArray<T>): T | null {
  const needle = categoryNameKey(name);
  if (!needle) return null;
  return (
    existing.find(
      (row) => row.archivedAt != null && categoryNameKey(row.name) === needle,
    ) ?? null
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

export function categoryNameMessage(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return "Dale un nombre a la categoría.";
  if (visibleLength(trimmed) > CATEGORY_NAME_MAX) {
    return `El nombre debe tener ${CATEGORY_NAME_MAX} caracteres o menos.`;
  }
  return null;
}

export function withCurrentCategory(
  active: readonly HouseholdCategory[],
  current: HouseholdCategory | null | undefined,
): HouseholdCategory[] {
  if (!current) return [...active];
  if (active.some((row) => row.id === current.id)) return [...active];
  return [...active, current].sort((a, b) => a.name.localeCompare(b.name, "es"));
}

export function activeIncomeCategories(
  categories: readonly HouseholdCategory[],
  householdId: string,
): HouseholdCategory[] {
  return categories
    .filter(
      (category) =>
        category.householdId === householdId &&
        category.type === "income" &&
        category.archivedAt == null,
    )
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

function matchesIncomeCatalogName(
  category: { name: string },
  canonical: string,
): boolean {
  return categoryNameKey(category.name) === categoryNameKey(canonical);
}

export function isSueldoIncomeCategory(category: { name: string }): boolean {
  return matchesIncomeCatalogName(category, SUELDO_INCOME_CATEGORY_NAME);
}

export function isExtraIncomeCategory(category: { name: string }): boolean {
  return matchesIncomeCatalogName(category, EXTRA_INCOME_CATEGORY_NAME);
}

/** Sueldo and Extra: the only income categories a form may pick. */
export function selectableIncomeCategories(
  categories: readonly HouseholdCategory[],
  householdId: string,
): HouseholdCategory[] {
  return activeIncomeCategories(categories, householdId).filter(
    (row) => isSueldoIncomeCategory(row) || isExtraIncomeCategory(row),
  );
}

/** Recurring income is Sueldo only. Extra is registered per event. */
export function recurringIncomeCategories(
  categories: readonly HouseholdCategory[],
  householdId: string,
): HouseholdCategory[] {
  return activeIncomeCategories(categories, householdId).filter(isSueldoIncomeCategory);
}
