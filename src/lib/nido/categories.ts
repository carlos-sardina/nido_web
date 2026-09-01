import { nidoFail, type NidoResult } from "./errors";
import {
  archiveCategoryWithAuth,
  canSubmitCategory,
  createCategoryWithAuth,
  renameCategoryWithAuth,
  type CreateCategoryInput,
  type RenameCategoryInput,
} from "./category-mutations.ts";
import { fetchHouseholdCategoriesByType } from "./queries/categories";
import { nidoClient, requireUser, type NidoClient } from "./session";

export { canSubmitCategory };

export async function createCategory(
  input: CreateCategoryInput,
  supabase: NidoClient = nidoClient(),
): Promise<NidoResult<{ id: string }>> {
  const auth = await requireUser(supabase);
  if (auth.ok === false) return nidoFail(auth.error.code);

  const catalog = input.householdId
    ? await fetchHouseholdCategoriesByType(input.householdId, input.type, supabase)
    : null;
  const existing = catalog?.ok === true ? catalog.data : input.existing;

  return createCategoryWithAuth(
    { ...input, existing },
    {
      getUserId: async () => auth.data.user.id,
      rpc: async (fn, args) => auth.data.supabase.rpc(fn, args as never),
    },
  );
}

export async function renameCategory(
  input: RenameCategoryInput,
  supabase: NidoClient = nidoClient(),
): Promise<NidoResult<{ id: string }>> {
  const auth = await requireUser(supabase);
  if (auth.ok === false) return nidoFail(auth.error.code);

  const catalog =
    input.householdId && input.type
      ? await fetchHouseholdCategoriesByType(input.householdId, input.type, supabase)
      : null;
  const existing = catalog?.ok === true ? catalog.data : input.existing;

  return renameCategoryWithAuth(
    { ...input, existing },
    {
      getUserId: async () => auth.data.user.id,
      rpc: async (fn, args) => auth.data.supabase.rpc(fn, args as never),
    },
  );
}

export async function archiveCategory(
  categoryId: string,
  supabase: NidoClient = nidoClient(),
): Promise<NidoResult<{ id: string }>> {
  const auth = await requireUser(supabase);
  if (auth.ok === false) return nidoFail(auth.error.code);

  return archiveCategoryWithAuth(categoryId, {
    getUserId: async () => auth.data.user.id,
    rpc: async (fn, args) => auth.data.supabase.rpc(fn, args as never),
  });
}
