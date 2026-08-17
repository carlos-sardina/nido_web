"use client";

import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "@/app/components/ui/utils";
import { Text } from "@/components/nido/Typography";

export function FieldLabel({
  htmlFor,
  children,
}: {
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="mb-2 block text-label font-semibold text-muted-foreground">
      {children}
    </label>
  );
}

export function TextInput({
  invalid = false,
  filled = false,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
  filled?: boolean;
}) {
  return (
    <input
      className={cn(
        "w-full h-14 px-4 rounded-2xl text-body font-medium bg-card text-foreground border-2 outline-none transition-colors",
        "placeholder:text-muted-foreground placeholder:font-normal",
        "focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/40",
        "disabled:cursor-not-allowed disabled:opacity-50",
        invalid
          ? "border-danger"
          : filled
            ? "border-primary"
            : "border-muted",
        className,
      )}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
}

export function MoneyField({
  id,
  label,
  value,
  onChange,
  placeholder,
  invalid = false,
  disabled = false,
  describedBy,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
  describedBy?: string;
}) {
  const filled = Boolean(value);

  return (
    <div>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div
        className={cn(
          "h-14 px-4 rounded-2xl border-2 flex items-center gap-1 bg-card transition-colors",
          "focus-within:border-primary focus-within:ring-2 focus-within:ring-ring/40",
          invalid ? "border-danger" : filled ? "border-primary" : "border-muted",
        )}
      >
        <span className="text-body text-muted-foreground flex-shrink-0">$</span>
        <input
          id={id}
          className="flex-1 min-w-0 h-full text-body bg-transparent outline-none text-foreground placeholder:text-muted-foreground"
          type="text"
          inputMode="decimal"
          placeholder={placeholder}
          value={value}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value.replace(/[^0-9.]/g, ""))}
        />
      </div>
    </div>
  );
}

export function FieldError({
  id,
  children,
  className,
}: {
  id?: string;
  children: ReactNode;
  className?: string;
}) {
  if (!children) return null;
  return (
    <Text
      id={id}
      size="caption"
      tone="danger"
      role="alert"
      className={cn("leading-relaxed whitespace-pre-line", className)}
    >
      {children}
    </Text>
  );
}

export function HelperText({
  id,
  children,
  className,
}: {
  id?: string;
  children: ReactNode;
  className?: string;
}) {
  if (!children) return null;
  return (
    <Text id={id} size="caption" tone="muted" className={cn("leading-relaxed", className)}>
      {children}
    </Text>
  );
}

export function Field({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("space-y-2", className)}>{children}</div>;
}
