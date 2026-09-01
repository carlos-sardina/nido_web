import { nidoErrorFromUnknown, nidoFail, nidoOk, type NidoResult } from "./errors.ts";
import {
  CATEGORY_NAME_TAKEN,
  categoryRenameConflictMessage,
  isDuplicateActiveCategoryName,
  normalizeCategoryName,
} from "./financial/categories.ts";

export type CategoryMutationAuth = {
  getUserId: () => Promise<string | null>;
  rpc: (
    fn: "create_category" | "rename_category" | "archive_category",
    args: Record<string, unknown>,
  ) => Promise<{ data: string | null; error: unknown }>;
};

export type CreateCategoryInput = {
  name: string;
  type: "income" | "expense";
  icon?: string | null;
  householdId?: string;
  existing: ReadonlyArray<{ name: string; archivedAt?: string | null }>;
};

export type RenameCategoryInput = {
  categoryId: string;
  name: string;
  householdId?: string;
  type?: "income" | "expense";
  existing: ReadonlyArray<{ id?: string; name: string; archivedAt?: string | null }>;
};

export async function createCategoryWithAuth(
  input: CreateCategoryInput,
  auth: CategoryMutationAuth,
): Promise<NidoResult<{ id: string }>> {
  const userId = await auth.getUserId();
  if (!userId) return nidoFail("unauthenticated");

  if (input.type !== "income" && input.type !== "expense") {
    return nidoFail("invalid_category");
  }
  if (input.type === "income") {
    return nidoFail("invalid_category", "Los ingresos solo usan Sueldo y Extra.");
  }

  const name = normalizeCategoryName(input.name);
  if (!name) return nidoFail("invalid_name", "Dale un nombre a la categoría.");

  if (isDuplicateActiveCategoryName(name, input.existing)) {
    return nidoFail("conflict", CATEGORY_NAME_TAKEN);
  }

  const icon = input.icon?.trim() || null;
  const { data, error } = await auth.rpc("create_category", {
    p_name: name,
    p_type: input.type,
    p_icon: icon,
  });
  if (error) {
    const mapped = nidoErrorFromUnknown(error);
    if (mapped.code === "conflict") {
      return nidoFail("conflict", CATEGORY_NAME_TAKEN);
    }
    return nidoFail(mapped.code);
  }
  if (!data) return nidoFail("network");
  return nidoOk({ id: data });
}

export async function renameCategoryWithAuth(
  input: RenameCategoryInput,
  auth: CategoryMutationAuth,
): Promise<NidoResult<{ id: string }>> {
  const userId = await auth.getUserId();
  if (!userId) return nidoFail("unauthenticated");
  if (!input.categoryId) return nidoFail("invalid_category");
  if (input.type === "income") {
    return nidoFail("invalid_category", "Las categorías de ingreso no se pueden cambiar.");
  }

  const name = normalizeCategoryName(input.name);
  if (!name) return nidoFail("invalid_name", "Dale un nombre a la categoría.");

  const conflict = categoryRenameConflictMessage(name, input.existing, input.categoryId);
  if (conflict) {
    return nidoFail("conflict", conflict);
  }

  const { data, error } = await auth.rpc("rename_category", {
    p_category_id: input.categoryId,
    p_name: name,
  });
  if (error) {
    const mapped = nidoErrorFromUnknown(error);
    if (mapped.code === "conflict") {
      return nidoFail("conflict", CATEGORY_NAME_TAKEN);
    }
    return nidoFail(mapped.code);
  }
  if (!data) return nidoFail("network");
  return nidoOk({ id: data });
}

export async function archiveCategoryWithAuth(
  categoryId: string,
  auth: CategoryMutationAuth,
): Promise<NidoResult<{ id: string }>> {
  const userId = await auth.getUserId();
  if (!userId) return nidoFail("unauthenticated");
  if (!categoryId) return nidoFail("invalid_category");

  const { data, error } = await auth.rpc("archive_category", {
    p_category_id: categoryId,
  });
  if (error) return nidoFail(nidoErrorFromUnknown(error).code);
  if (!data) return nidoFail("network");
  return nidoOk({ id: data });
}

export function canSubmitCategory(submitting: boolean): boolean {
  return !submitting;
}
