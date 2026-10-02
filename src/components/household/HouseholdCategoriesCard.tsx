"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TextLink } from "@/components/nido/TextLink";
import { Text } from "@/components/nido/Typography";
import { archiveCategory, canSubmitCategory, renameCategory } from "@/lib/nido/categories";
import {
  categoryNameMessage,
  categoryRenameConflictMessage,
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
  const [rowMode, setRowMode] = useState<Record<string, RowMode>>({});
  const [rowDraft, setRowDraft] = useState<Record<string, string>>({});
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
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
      <Text size="label">Presupuestos</Text>
      <Text size="caption" tone="muted" className="leading-relaxed">
        Renombra o archiva un nombre. El límite del mes se crea con el presupuesto. Archivar no borra los movimientos que ya lo usan.
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
    </div>
  );
}
