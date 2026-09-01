"use client";

import { useId, useRef, useState } from "react";
import { cn } from "@/app/components/ui/utils";
import { Button } from "@/components/nido/Button";
import { CategoryCreateFields } from "@/components/nido/CategoryEmojiField";
import { FieldError } from "@/components/nido/Field";
import { Text } from "@/components/nido/Typography";
import { canSubmitCategory, createCategory } from "@/lib/nido/categories";
import {
  categoryNameMessage,
  DEFAULT_CATEGORY_EMOJI,
  normalizeCategoryName,
  resolveCategoryIcon,
  withCurrentCategory,
  type HouseholdCategory,
} from "@/lib/nido/financial";

export function CategoryPicker({
  householdId,
  type,
  categories,
  selectedId,
  loading,
  disabled,
  labelledBy,
  fallbackIcon,
  onSelect,
  onCategoriesChange,
}: {
  householdId: string;
  type: "expense" | "income";
  categories: HouseholdCategory[];
  selectedId: string;
  loading: boolean;
  disabled?: boolean;
  labelledBy?: string;
  fallbackIcon: string;
  onSelect: (categoryId: string) => void;
  onCategoriesChange: (categories: HouseholdCategory[]) => void;
}) {
  const ids = useId();
  const creatingRef = useRef(false);
  const [showCreate, setShowCreate] = useState(false);
  const [focusName, setFocusName] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmoji, setNewEmoji] = useState(DEFAULT_CATEGORY_EMOJI);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const createVisible = type === "expense" && (showCreate || categories.length === 0);

  const resetCreate = () => {
    setFocusName(false);
    setNewName("");
    setNewEmoji(DEFAULT_CATEGORY_EMOJI);
    setCreateError(null);
  };

  const openCreate = () => {
    setShowCreate(true);
    setFocusName(true);
    setCreateError(null);
  };

  const closeCreate = () => {
    if (creating || categories.length === 0) return;
    setShowCreate(false);
    resetCreate();
  };

  const handleCreate = async () => {
    if (!canSubmitCategory(creating) || creatingRef.current) return;
    const message = categoryNameMessage(newName);
    if (message) {
      setCreateError(message);
      return;
    }

    creatingRef.current = true;
    setCreating(true);
    setCreateError(null);
    const icon = resolveCategoryIcon(newEmoji);
    const result = await createCategory({
      name: newName,
      type,
      icon,
      householdId,
      existing: categories,
    });
    creatingRef.current = false;
    setCreating(false);
    if (result.ok === false) {
      setCreateError(result.error.message);
      return;
    }

    const name = normalizeCategoryName(newName);
    if (!name) {
      setCreateError("Dale un nombre a la categoría.");
      return;
    }

    const created: HouseholdCategory = {
      id: result.data.id,
      householdId,
      name,
      icon,
      type,
      isDefault: false,
      archivedAt: null,
    };
    onCategoriesChange(withCurrentCategory(categories, created));
    onSelect(created.id);
    setShowCreate(false);
    resetCreate();
  };

  if (loading) {
    return (
      <Text size="caption" tone="muted">
        Cargando categorías…
      </Text>
    );
  }

  return (
    <div className="space-y-2">
      {categories.length > 0 ? (
        <div className="grid grid-cols-2 gap-2" role="group" aria-labelledby={labelledBy}>
          {categories.map((category) => {
            const selected = selectedId === category.id;
            return (
              <button
                key={category.id}
                type="button"
                aria-pressed={selected}
                disabled={disabled || creating}
                onClick={() => onSelect(category.id)}
                className={cn(
                  "flex items-center gap-2 p-3 rounded-2xl border-2 text-left transition-all",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  "disabled:cursor-not-allowed disabled:opacity-70",
                  selected ? "border-primary bg-card" : "border-border bg-card",
                )}
              >
                <span className="text-body flex-shrink-0" aria-hidden="true">
                  {category.icon ?? fallbackIcon}
                </span>
                <Text as="span" size="label" className="min-w-0 truncate">
                  {category.name}
                </Text>
              </button>
            );
          })}
        </div>
      ) : (
        <Text size="caption" tone="muted">
          {type === "expense" ? "Crea una categoría para continuar." : "No hay categorías disponibles."}
        </Text>
      )}

      {createVisible ? (
        <div className="space-y-2 rounded-2xl border-2 border-border bg-card p-3">
          <label htmlFor={`${ids}-new-name`} className="sr-only">
            Nombre de la nueva categoría
          </label>
          <CategoryCreateFields
            emoji={newEmoji}
            onEmojiChange={setNewEmoji}
            nameId={`${ids}-new-name`}
            name={newName}
            onNameChange={(value) => {
              setNewName(value);
              setCreateError(null);
            }}
            disabled={disabled || creating}
            autoFocusName={focusName}
            nameInvalid={Boolean(createError)}
            nameDescribedBy={createError ? `${ids}-create-error` : undefined}
            onNameKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void handleCreate();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                closeCreate();
              }
            }}
          />
          <FieldError id={`${ids}-create-error`}>{createError}</FieldError>
          <div className="flex gap-2">
            {categories.length > 0 ? (
              <Button
                variant="ghost"
                size="compact"
                disabled={disabled || creating}
                onClick={closeCreate}
              >
                Cancelar
              </Button>
            ) : null}
            <Button
              size="compact"
              loading={creating}
              disabled={disabled || !canSubmitCategory(creating)}
              onClick={() => {
                void handleCreate();
              }}
            >
              {creating ? "Creando…" : "Crear"}
            </Button>
          </div>
        </div>
      ) : type === "expense" ? (
        <button
          type="button"
          disabled={disabled}
          onClick={openCreate}
          className={cn(
            "flex w-full items-center gap-2 h-12 px-4 rounded-2xl border-2 border-dashed text-left transition-all",
            "text-muted-foreground border-border bg-transparent",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "disabled:cursor-not-allowed disabled:opacity-70",
          )}
        >
          <span className="text-body flex-shrink-0" aria-hidden="true">
            ➕
          </span>
          <Text as="span" size="label">
            Nueva categoría
          </Text>
        </button>
      ) : null}
    </div>
  );
}
