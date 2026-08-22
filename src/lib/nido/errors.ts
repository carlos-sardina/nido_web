import type { NidoErrorCode } from "./types";

export type { NidoErrorCode };

const USER_MESSAGES: Record<NidoErrorCode, string> = {
  unauthenticated: "Inicia sesión para continuar.",
  already_in_nido: "Ya perteneces a un Nido. Solo puedes tener uno activo.",
  already_member: "Ya perteneces a este Nido.",
  invalid_name: "El nombre del Nido no es válido.",
  invalid_email: "El correo de la invitación no es válido.",
  self_invite: "No puedes invitarte a ti mismo.",
  invitation_invalid: "Esta invitación no es válida.",
  invitation_expired: "Esta invitación expiró.",
  invitation_accepted: "Esta invitación ya fue aceptada.",
  invite_pending: "Ya existe una invitación pendiente para ese correo.",
  not_a_member: "No perteneces a un Nido activo.",
  last_owner: "No puedes salir siendo el único propietario del Nido.",
  forbidden: "No tienes permiso para hacer esto.",
  invalid_amount: "Ingresa un monto válido.",
  invalid_description: "Ingresa una descripción válida.",
  invalid_category: "Esta categoría no está disponible.",
  invalid_split: "La división del gasto no es válida.",
  invalid_date: "La fecha no es válida.",
  expense_not_found: "No encontramos este gasto.",
  expense_deleted: "Este gasto ya fue eliminado.",
  goal_not_found: "No encontramos esta meta.",
  goal_archived: "Esta meta ya fue archivada.",
  contribution_not_found: "No encontramos esta aportación.",
  contribution_deleted: "Esta aportación ya fue eliminada.",
  income_not_found: "No encontramos este ingreso.",
  income_deleted: "Este ingreso ya fue eliminado.",
  conflict: "Este gasto cambió. Inténtalo de nuevo.",
  network: "No pudimos completar la operación. Inténtalo de nuevo.",
};

export class NidoError extends Error {
  readonly code: NidoErrorCode;

  constructor(code: NidoErrorCode, message = USER_MESSAGES[code]) {
    super(message);
    this.name = "NidoError";
    this.code = code;
  }
}

export type NidoResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: NidoError };

export function nidoOk<T>(data: T): NidoResult<T> {
  return { ok: true, data };
}

export function nidoFail(code: NidoErrorCode, message?: string): NidoResult<never> {
  return { ok: false, error: new NidoError(code, message) };
}

export function isNidoFailure<T>(
  result: NidoResult<T>,
): result is { ok: false; error: NidoError } {
  return result.ok === false;
}

const MESSAGE_CODES: Record<string, NidoErrorCode> = {
  "nido.unauthenticated": "unauthenticated",
  "nido.already_in_nido": "already_in_nido",
  "nido.already_member": "already_member",
  "nido.invalid_name": "invalid_name",
  "nido.invalid_email": "invalid_email",
  "nido.self_invite": "self_invite",
  "nido.invitation_invalid": "invitation_invalid",
  "nido.invitation_expired": "invitation_expired",
  "nido.invitation_accepted": "invitation_accepted",
  "nido.invite_pending": "invite_pending",
  "nido.not_a_member": "not_a_member",
  "nido.last_owner": "last_owner",
  "nido.forbidden": "forbidden",
  "nido.invalid_amount": "invalid_amount",
  "nido.invalid_description": "invalid_description",
  "nido.invalid_category": "invalid_category",
  "nido.invalid_split": "invalid_split",
  "nido.invalid_date": "invalid_date",
  "nido.expense_not_found": "expense_not_found",
  "nido.expense_deleted": "expense_deleted",
  "nido.goal_not_found": "goal_not_found",
  "nido.goal_archived": "goal_archived",
  "nido.contribution_not_found": "contribution_not_found",
  "nido.contribution_deleted": "contribution_deleted",
  "nido.income_not_found": "income_not_found",
  "nido.income_deleted": "income_deleted",
  "nido.conflict": "conflict",
};

function readErrorField(error: unknown, key: string): string | null {
  if (!error || typeof error !== "object") return null;
  const value = (error as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function extractRawMessage(error: unknown): string {
  if (error instanceof NidoError) return error.message;
  if (error instanceof Error) return error.message;
  return readErrorField(error, "message") ?? "";
}

export function nidoErrorFromUnknown(error: unknown): NidoError {
  if (error instanceof NidoError) return error;

  const raw = extractRawMessage(error);
  const pgCode = readErrorField(error, "code");

  for (const [needle, code] of Object.entries(MESSAGE_CODES)) {
    if (raw.includes(needle)) return new NidoError(code);
  }

  if (pgCode === "23505") {
    if (/household_invitations_pending_email/i.test(raw)) {
      return new NidoError("invite_pending");
    }
    if (/expense/i.test(raw)) {
      return new NidoError("conflict");
    }
    return new NidoError("already_in_nido");
  }

  if (pgCode === "42501" || /row-level security/i.test(raw)) {
    return new NidoError("forbidden");
  }

  return new NidoError("network");
}

export function userMessageFor(code: NidoErrorCode): string {
  return USER_MESSAGES[code];
}
