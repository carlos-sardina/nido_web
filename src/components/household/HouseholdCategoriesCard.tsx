"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/nido/Button";
import { TextLink } from "@/components/nido/TextLink";
import { Text } from "@/components/nido/Typography";
import { archiveCategory, canSubmitCategory, createCategory, renameCategory } from "@/lib/nido/categories";
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
    setNewName("");
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
    <div className="mx-6 mb-3 rounded-[1.5rem] p-4 space-y-3" style={{ backgroundColor: P.card }}>
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
          <div key={category.id} className="rounded-2xl p-3 space-y-2" style={{ backgroundColor: P.sub }}>
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
                  style={{ backgroundColor: P.card, color: P.text, borderColor: P.border }}
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
        <label htmlFor="new-category-name" className="sr-only">Nueva categoría</label>
        <input
          id="new-category-name"
          type="text"
          value={newName}
          disabled={creating}
          maxLength={80}
          placeholder="Nueva categoría"
          onChange={(event) => {
            setNewName(event.target.value);
            setCreateError(null);
            setCreateSuccess(null);
          }}
          className="w-full h-12 px-4 rounded-2xl text-sm outline-none border-2"
          style={{ backgroundColor: P.sub, color: P.text, borderColor: createError ? P.danger : P.border }}
        />
        {createError && <Text size="caption" tone="danger" role="alert">{createError}</Text>}
        {createSuccess && <Text size="caption" tone="brand" role="status">{createSuccess}</Text>}
        <Button
          size="compact"
          loading={creating}
          disabled={!canSubmitCategory(creating)}
          onClick={() => { void handleCreate(); }}
        >
          {creating ? "Creando…" : "Crear categoría"}
        </Button>
      </div>
    </div>
  );
}
