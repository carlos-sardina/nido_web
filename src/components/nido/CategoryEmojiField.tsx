"use client";

import type { InputHTMLAttributes } from "react";
import { cn } from "@/app/components/ui/utils";
import { TextInput } from "@/components/nido/Field";
import {
  DEFAULT_CATEGORY_EMOJI,
  emojiFromInput,
  isQuickCategoryEmoji,
  QUICK_CATEGORY_EMOJIS,
} from "@/lib/nido/financial/category-icon";

export function CategoryEmojiPicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (emoji: string) => void;
  disabled?: boolean;
}) {
  const selected = value || DEFAULT_CATEGORY_EMOJI;
  const isQuick = isQuickCategoryEmoji(selected);

  return (
    <div className="flex gap-2 overflow-x-auto [&::-webkit-scrollbar]:hidden">
      {QUICK_CATEGORY_EMOJIS.map((emoji) => {
        const pressed = selected === emoji;
        return (
          <button
            key={emoji}
            type="button"
            disabled={disabled}
            aria-label={`Emoji ${emoji}`}
            aria-pressed={pressed}
            onClick={() => onChange(emoji)}
            className={cn(
              "flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center text-lg transition-all border-2",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "disabled:cursor-not-allowed disabled:opacity-70",
              pressed ? "bg-primary/20 border-primary" : "bg-card border-transparent",
            )}
          >
            {emoji}
          </button>
        );
      })}
      <input
        type="text"
        aria-label="Otro emoji"
        placeholder="＋"
        disabled={disabled}
        className={cn(
          "flex-shrink-0 w-11 h-11 rounded-xl text-lg text-center outline-none border-2 transition-all",
          "text-foreground",
          "focus-visible:ring-2 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-70",
          !isQuick ? "bg-primary/20 border-primary" : "bg-card border-transparent",
        )}
        value={!isQuick ? selected : ""}
        onChange={(event) => onChange(emojiFromInput(event.target.value))}
      />
    </div>
  );
}

export function CategoryEmojiInput({
  value,
  onChange,
  disabled,
  className,
  "aria-label": ariaLabel = "Emoji de la categoría",
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  value: string;
  onChange: (emoji: string) => void;
}) {
  return (
    <input
      {...props}
      type="text"
      aria-label={ariaLabel}
      disabled={disabled}
      className={cn(
        "w-11 h-11 rounded-xl text-lg text-center outline-none border-2 flex-shrink-0",
        "bg-card text-foreground border-primary",
        "focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-70",
        className,
      )}
      value={value || DEFAULT_CATEGORY_EMOJI}
      onChange={(event) => onChange(emojiFromInput(event.target.value))}
    />
  );
}

export function CategoryCreateFields({
  emoji,
  onEmojiChange,
  nameId,
  name,
  onNameChange,
  namePlaceholder = "Nombre de la categoría",
  disabled,
  autoFocusName,
  nameInvalid,
  nameDescribedBy,
  nameMaxLength = 80,
  onNameKeyDown,
}: {
  emoji: string;
  onEmojiChange: (emoji: string) => void;
  nameId?: string;
  name: string;
  onNameChange: (name: string) => void;
  namePlaceholder?: string;
  disabled?: boolean;
  autoFocusName?: boolean;
  nameInvalid?: boolean;
  nameDescribedBy?: string;
  nameMaxLength?: number;
  onNameKeyDown?: InputHTMLAttributes<HTMLInputElement>["onKeyDown"];
}) {
  return (
    <div className="space-y-4">
      <CategoryEmojiPicker value={emoji} onChange={onEmojiChange} disabled={disabled} />
      <div className="flex gap-2">
        <CategoryEmojiInput value={emoji} onChange={onEmojiChange} disabled={disabled} />
        <TextInput
          id={nameId}
          value={name}
          maxLength={nameMaxLength}
          placeholder={namePlaceholder}
          autoFocus={autoFocusName}
          disabled={disabled}
          invalid={nameInvalid}
          filled={Boolean(name)}
          aria-describedby={nameDescribedBy}
          className="h-11"
          onChange={(event) => onNameChange(event.target.value)}
          onKeyDown={onNameKeyDown}
        />
      </div>
    </div>
  );
}
