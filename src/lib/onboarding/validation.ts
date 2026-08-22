import type { Model, OData } from "../types";

export const HOUSEHOLD_NAME_MAX = 80;
export const DISPLAY_NAME_MAX = 80;

/** Aligns with `numeric(12, 2)` and a reasonable onboarding ceiling. */
export const MAX_MONEY_AMOUNT = 9_999_999_999.99;
export const MAX_MONEY_DECIMALS = 2;
export const EXPENSE_NAME_MAX = 80;

const NEGATIVE_MESSAGE = "El monto no puede ser negativo.";
const INVALID_MESSAGE = "Ingresa un monto válido.";
const TOO_LARGE_MESSAGE = "El monto es demasiado grande.";

function looksNegative(raw: string): boolean {
  return /^\s*-/.test(raw) || /-\s*\d/.test(raw);
}

function decimalPlacesOf(normalized: string): number {
  const dot = normalized.indexOf(".");
  return dot === -1 ? 0 : normalized.length - dot - 1;
}

/**
 * Parse a money string without coercing invalid input to zero.
 * Accepts optional `$` and thousands commas. Rejects NaN, Infinity,
 * scientific notation, negatives, and more than two decimal places.
 */
export function parseMoneyInput(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (looksNegative(trimmed)) return null;
  if (/[eE]|inf|nan/i.test(trimmed)) return null;

  const withoutCurrency = trimmed.replace(/^\$\s*/, "").replace(/,/g, "").trim();
  if (!withoutCurrency || withoutCurrency === ".") return null;
  if (!/^\d*(\.\d*)?$/.test(withoutCurrency)) return null;

  const decimalPlaces = decimalPlacesOf(withoutCurrency);
  if (decimalPlaces > MAX_MONEY_DECIMALS) return null;

  const value = Number(withoutCurrency);
  if (!Number.isFinite(value)) return null;
  return value;
}

export function formatMoneyInput(raw: string): string {
  const value = raw.replace(/[^0-9.]/g, "");
  if (!value) return "";
  const [integerPart, decimalPart] = value.split(".");
  const formattedInt = parseInt(integerPart || "0", 10);
  if (!Number.isFinite(formattedInt)) return "";
  const grouped = formattedInt.toLocaleString("es-MX");
  return decimalPart !== undefined ? `${grouped}.${decimalPart.slice(0, MAX_MONEY_DECIMALS)}` : grouped;
}

export function validateRequiredAmount(raw: string): string | null {
  if (!raw.trim()) return INVALID_MESSAGE;
  if (looksNegative(raw)) return NEGATIVE_MESSAGE;

  const stripped = raw.trim().replace(/^\$\s*/, "").replace(/,/g, "");
  if (decimalPlacesOf(stripped) > MAX_MONEY_DECIMALS) return INVALID_MESSAGE;

  const value = parseMoneyInput(raw);
  if (value === null) return INVALID_MESSAGE;
  if (value < 0) return NEGATIVE_MESSAGE;
  if (value > MAX_MONEY_AMOUNT) return TOO_LARGE_MESSAGE;
  return null;
}

export function validateOptionalAmount(raw: string): string | null {
  if (!raw.trim()) return null;
  return validateRequiredAmount(raw);
}

export function isPositiveAmount(raw: string): boolean {
  const value = parseMoneyInput(raw);
  return value !== null && value > 0 && value <= MAX_MONEY_AMOUNT;
}

export function validateExpenseAmount(raw: string): string | null {
  const invalid = validateRequiredAmount(raw);
  if (invalid) return invalid;
  if (!isPositiveAmount(raw)) return INVALID_MESSAGE;
  return null;
}

export function validateHouseholdName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Dale un nombre a tu Nido.";
  if (Array.from(trimmed).length > HOUSEHOLD_NAME_MAX) {
    return `El nombre debe tener ${HOUSEHOLD_NAME_MAX} caracteres o menos.`;
  }
  return null;
}

export function validateDisplayName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Ingresa el nombre que verán los demás miembros.";
  if (Array.from(trimmed).length > DISPLAY_NAME_MAX) {
    return `El nombre debe tener ${DISPLAY_NAME_MAX} caracteres o menos.`;
  }
  return null;
}

export function validateCustomExpenseName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Ingresa el nombre del gasto.";
  if (Array.from(trimmed).length > EXPENSE_NAME_MAX) {
    return `El nombre debe tener ${EXPENSE_NAME_MAX} caracteres o menos.`;
  }
  return null;
}

export function validateExpenseType(type: string | null | undefined): type is "personal" | "shared" {
  return type === "personal" || type === "shared";
}

export function validateExpenseEntry(input: {
  amount: string;
  type: string | null | undefined;
}): string | null {
  if (!validateExpenseType(input.type)) return "Elige si el gasto es personal o compartido.";
  return validateExpenseAmount(input.amount);
}

export function normalizeCustomExpenseName(name: string): string | null {
  const invalid = validateCustomExpenseName(name);
  return invalid ? null : name.trim();
}

export function validateIncome(raw: string): string | null {
  return validateRequiredAmount(raw);
}

export function validateSavings(personal: string, shared: string): string | null {
  return validateOptionalAmount(personal) ?? validateOptionalAmount(shared);
}

export function hasSelectedExpense(data: Pick<OData, "expenses">): boolean {
  return data.expenses.some(
    (expense) =>
      expense.selected
      && isPositiveAmount(expense.amount)
      && validateExpenseType(expense.type),
  );
}

export function personalExpenseTotal(data: Pick<OData, "expenses">): number {
  return data.expenses.reduce((sum, expense) => {
    if (!expense.selected || expense.type !== "personal") return sum;
    return sum + (parseMoneyInput(expense.amount) ?? 0);
  }, 0);
}

export function divisionMethodHint(input: {
  method: Model;
  income: string;
  personalExpenseTotal: number;
}): string | null {
  const income = parseMoneyInput(input.income);

  if (input.method === "proportional" && income === null) {
    return "Este método usa tu ingreso. Los ingresos de otras personas se podrán completar después.";
  }

  return null;
}

export function validateOnboardingFinalize(data: Pick<OData, "nestName" | "userName" | "salary">): string | null {
  return validateHouseholdName(data.nestName)
    ?? validateDisplayName(data.userName)
    ?? validateIncome(data.salary);
}

export function canStartExclusiveAction(submitting: boolean): boolean {
  return !submitting;
}
