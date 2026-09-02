"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/app/components/ui/utils";
import { Button } from "@/components/nido/Button";
import { CategoryCreateFields } from "@/components/nido/CategoryEmojiField";
import { TextLink } from "@/components/nido/TextLink";
import { Text } from "@/components/nido/Typography";
import { archiveCategory, canSubmitCategory, createCategory, renameCategory } from "@/lib/nido/categories";
import {
  DEFAULT_CATEGORY_EMOJI,
  resolveCategoryIcon,
} from "@/lib/nido/financial/category-icon";
import {
  categoryNameMessage,
  categoryRenameConflictMessage,
  findArchivedCategoryByNormalizedName,
  type HouseholdCategory,
} from "@/lib/nido/financial/categories";
import { fetchHouseholdCategories } from "@/lib/nido/queries/categories";
import { P } from "@/lib/palette";

type RowMode = "view" | "rename" | "archive";

export function HouseholdCategoriesCard({
  householdId,
  refreshKey = 0,
}: {
  householdId: string;
  refreshKey?: number;
}) {
  const [categories, setCategories] = useState<HouseholdCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newEmoji, setNewEmoji] = useState(DEFAULT_CATEGORY_EMOJI);
  const [showCreate, setShowCreate] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [rowMode, setRowMode] = useState<Record<string, RowMode>>({});
  const [rowDraft, setRowDraft] = useState<Record<string, string>>({});
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const creatingRef = useRef(false);
  const busyRef = useRef(false);
  const categoriesRef = useRef(categories);
  categoriesRef.current = categories;

  const expenses = categories.filter((row) => row.type === "expense");
  const visible = expenses.filter((row) => row.archivedAt == null);
  const createVisible = showCreate || (!loading && !listError && visible.length === 0);

  const resetCreate = () => {
    setNewName("");
    setNewEmoji(DEFAULT_CATEGORY_EMOJI);
    setCreateError(null);
  };

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = Boolean(opts?.silent && categoriesRef.current.length > 0);
    if (!silent) {
      setLoading(true);
      setListError(null);
    }
    const result = await fetchHouseholdCategories(householdId);
    if (result.ok === false) {
      setListError(result.error.message);
      if (!silent) setCategories([]);
      setLoading(false);
      return;
    }
    setListError(null);
    setCategories(result.data);
    setLoading(false);
  }, [householdId]);

  useEffect(() => {
    void load({ silent: refreshKey > 0 });
  }, [load, refreshKey]);

  const handleCreate = async () => {
    if (!canSubmitCategory(creating) || creatingRef.current) return;
    const message = categoryNameMessage(newName);
    if (message) {
      setCreateError(message);
      setCreateSuccess(null);
      return;
    }

    creatingRef.current = true;
    setCreating(true);
    setCreateError(null);
    setCreateSuccess(null);
    const result = await createCategory({
      name: newName,
      type: "expense",
      icon: resolveCategoryIcon(newEmoji),
      householdId,
      existing: expenses,
    });
    creatingRef.current = false;
    setCreating(false);
    if (result.ok === false) {
      setCreateError(result.error.message);
      return;
    }
    const reactivated = findArchivedCategoryByNormalizedName(newName, expenses);
    resetCreate();
    setShowCreate(false);
    setCreateSuccess(reactivated ? "Categoría reactivada." : "Categoría creada.");
    await load();
  };

  const handleRename = async (category: HouseholdCategory) => {
    if (!canSubmitCategory(busyId != null) || busyRef.current) return;
    const draft = rowDraft[category.id] ?? category.name;
    const message = categoryNameMessage(draft)
      ?? categoryRenameConflictMessage(draft, expenses, category.id);
    if (message) {
      setRowError((current) => ({ ...current, [category.id]: message }));
      return;
    }

    busyRef.current = true;
    setBusyId(category.id);
    setRowError((current) => {
      const next = { ...current };
      delete next[category.id];
      return next;
    });
    const result = await renameCategory({
      categoryId: category.id,
      name: draft,
      householdId,
      type: category.type,
      existing: expenses,
    });
    busyRef.current = false;
    setBusyId(null);
    if (result.ok === false) {
      setRowError((current) => ({ ...current, [category.id]: result.error.message }));
      return;
    }
    setRowMode((current) => ({ ...current, [category.id]: "view" }));
    await load();
  };

  const handleArchive = async (category: HouseholdCategory) => {
    if (!canSubmitCategory(busyId != null) || busyRef.current) return;
    busyRef.current = true;
    setBusyId(category.id);
    const result = await archiveCategory(category.id);
    busyRef.current = false;
    setBusyId(null);
    if (result.ok === false) {
      setRowError((current) => ({ ...current, [category.id]: result.error.message }));
      return;
    }
    setRowMode((current) => ({ ...current, [category.id]: "view" }));
    await load();
  };

  return (
    <div className="px-6 mb-5 space-y-3">
      <Text size="label">Categorías</Text>
      <Text size="caption" tone="muted" className="leading-relaxed">
        Puedes crear, renombrar o archivar. Archivar no borra los movimientos que ya la usan.
      </Text>
      {loading && categories.length === 0 && <Text size="caption" tone="muted">Cargando categorías…</Text>}
      {listError && <Text size="caption" tone="danger" role="alert">{listError}</Text>}
      {!loading && !listError && visible.length === 0 && (
        <Text size="caption" tone="muted">No hay categorías activas en esta lista.</Text>
      )}
      {visible.map((category) => {
        const mode = rowMode[category.id] ?? "view";
        const busy = busyId === category.id;
        return (
          <div key={category.id} className="rounded-2xl p-3 space-y-2 shadow-sm" style={{ backgroundColor: P.card }}>
            {mode === "rename" ? (
              <>
                <input
                  type="text"
                  value={rowDraft[category.id] ?? category.name}
                  disabled={busy}
                  maxLength={80}
                  onChange={(event) => {
                    const value = event.target.value;
                    setRowDraft((current) => ({ ...current, [category.id]: value }));
                    const conflict = categoryNameMessage(value)
                      ? null
                      : categoryRenameConflictMessage(value, expenses, category.id);
                    setRowError((current) => {
                      const next = { ...current };
                      if (conflict) next[category.id] = conflict;
                      else delete next[category.id];
                      return next;
                    });
                  }}
                  className="w-full h-11 px-3 rounded-xl text-sm outline-none border"
                  style={{ backgroundColor: P.sub, color: P.text, borderColor: P.border }}
                />
                {rowError[category.id] && (
                  <Text size="caption" tone="danger" role="alert">{rowError[category.id]}</Text>
                )}
                <div className="flex gap-3">
                  <TextLink onClick={() => { void handleRename(category); }}>
                    {busy ? "Guardando…" : "Guardar"}
                  </TextLink>
                  <TextLink
                    tone="muted"
                    disabled={busy}
                    onClick={() => {
                      setRowMode((current) => ({ ...current, [category.id]: "view" }));
                      setRowError((current) => {
                        const next = { ...current };
                        delete next[category.id];
                        return next;
                      });
                    }}
                  >
                    Cancelar
                  </TextLink>
                </div>
              </>
            ) : mode === "archive" ? (
              <>
                <Text size="caption" className="leading-relaxed">
                  ¿Archivar {category.name}? Seguirá visible en los movimientos que ya la usan.
                </Text>
                {rowError[category.id] && (
                  <Text size="caption" tone="danger" role="alert">{rowError[category.id]}</Text>
                )}
                <div className="flex gap-3">
                  <TextLink onClick={() => { void handleArchive(category); }}>
                    {busy ? "Archivando…" : "Confirmar"}
                  </TextLink>
                  <TextLink
                    tone="muted"
                    disabled={busy}
                    onClick={() => setRowMode((current) => ({ ...current, [category.id]: "view" }))}
                  >
                    Cancelar
                  </TextLink>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-between gap-2 min-h-11">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    {category.icon ? (
                      <span className="shrink-0 leading-none" aria-hidden="true">{category.icon}</span>
                    ) : null}
                    <p className="text-xs font-semibold truncate leading-none" style={{ color: P.text }}>
                      {category.name}
                    </p>
                  </div>
                  {category.isDefault && (
                    <p className="text-[10px] mt-0.5" style={{ color: P.muted }}>Catálogo del Nido</p>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <TextLink
                    onClick={() => {
                      setRowDraft((current) => ({ ...current, [category.id]: category.name }));
                      setRowMode((current) => ({ ...current, [category.id]: "rename" }));
                      setRowError((current) => {
                        const next = { ...current };
                        delete next[category.id];
                        return next;
                      });
                    }}
                  >
                    Renombrar
                  </TextLink>
                  <TextLink
                    tone="muted"
                    onClick={() => setRowMode((current) => ({ ...current, [category.id]: "archive" }))}
                  >
                    Archivar
                  </TextLink>
                </div>
              </div>
            )}
          </div>
        );
      })}
      <div className="space-y-2 pt-1">
        {createVisible ? (
          <>
            <label htmlFor="new-category-name" className="sr-only">Nueva categoría</label>
            <CategoryCreateFields
              emoji={newEmoji}
              onEmojiChange={setNewEmoji}
              nameId="new-category-name"
              name={newName}
              onNameChange={(value) => {
                setNewName(value);
                setCreateError(null);
                setCreateSuccess(null);
              }}
              namePlaceholder="Nueva categoría"
              disabled={creating}
              nameInvalid={Boolean(createError)}
              onNameKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleCreate();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  if (creating || visible.length === 0) return;
                  setShowCreate(false);
                  resetCreate();
                }
              }}
            />
            {createError && <Text size="caption" tone="danger" role="alert">{createError}</Text>}
            <div className="flex gap-2">
              {visible.length > 0 ? (
                <Button
                  variant="ghost"
                  size="compact"
                  disabled={creating}
                  onClick={() => {
                    setShowCreate(false);
                    resetCreate();
                  }}
                >
                  Cancelar
                </Button>
              ) : null}
              <Button
                size="compact"
                loading={creating}
                disabled={!canSubmitCategory(creating)}
                onClick={() => { void handleCreate(); }}
              >
                {creating ? "Creando…" : "Crear categoría"}
              </Button>
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={() => {
              setShowCreate(true);
              setCreateError(null);
              setCreateSuccess(null);
            }}
            className={cn(
              "flex w-full items-center gap-2 h-12 px-4 rounded-2xl border-2 border-dashed text-left transition-all",
              "text-muted-foreground border-border bg-transparent",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
          >
            <span className="text-body flex-shrink-0" aria-hidden="true">➕</span>
            <Text as="span" size="label">Nueva categoría</Text>
          </button>
        )}
        {createSuccess && <Text size="caption" tone="brand" role="status">{createSuccess}</Text>}
      </div>
    </div>
  );
}
