import type { Model, OData } from "../types";

const MAX_REASONABLE = 1_000_000_000_000;

export function parseMoneyInput(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("-")) return null;

  const cleaned = trimmed.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;

  const firstDot = cleaned.indexOf(".");
  const normalized =
    firstDot === -1
      ? cleaned
      : `${cleaned.slice(0, firstDot)}.${cleaned.slice(firstDot + 1).replace(/\./g, "").slice(0, 2)}`;

  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  return value;
}

export function formatMoneyInput(raw: string): string {
  const value = raw.replace(/[^0-9.]/g, "");
  if (!value) return "";
  const [integerPart, decimalPart] = value.split(".");
  const formattedInt = parseInt(integerPart || "0", 10).toLocaleString("es-MX");
  return decimalPart !== undefined ? `${formattedInt}.${decimalPart.slice(0, 2)}` : formattedInt;
}

export function validateRequiredAmount(raw: string): string | null {
  const value = parseMoneyInput(raw);
  if (value === null) return "Ingresa un monto válido.";
  if (value < 0) return "El monto no puede ser negativo.";
  if (value > MAX_REASONABLE) return "Ingresa un monto válido.";
  return null;
}

export function validateOptionalAmount(raw: string): string | null {
  if (!raw.trim()) return null;
  return validateRequiredAmount(raw);
}

export function isPositiveAmount(raw: string): boolean {
  const value = parseMoneyInput(raw);
  return value !== null && value > 0;
}

export function validateHouseholdName(name: string): string | null {
  if (!name.trim()) return "Dale un nombre a tu Nido.";
  return null;
}

export function validateDisplayName(name: string): string | null {
  if (!name.trim()) return "Ingresa el nombre que verán los demás miembros.";
  return null;
}

export function validateIncome(raw: string): string | null {
  return validateRequiredAmount(raw);
}

export function validateSavings(personal: string, shared: string): string | null {
  return validateOptionalAmount(personal) ?? validateOptionalAmount(shared);
}

export function hasSelectedExpense(data: Pick<OData, "expenses">): boolean {
  return data.expenses.some((expense) => expense.selected && expense.amount);
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

  if (input.method === "capacity") {
    if (income === null) {
      return "Este método usa tu ingreso y tus gastos personales. Podrás completar los de otras personas después.";
    }
    if (input.personalExpenseTotal <= 0) {
      return "Marca tus gastos personales para calcular lo que te queda. Los de otras personas se podrán completar después.";
    }
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
