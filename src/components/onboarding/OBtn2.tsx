import { P } from "@/lib/palette";
import { Button, type NidoButtonVariant } from "@/components/nido/Button";

export function OBtn2({
  label,
  onClick,
  variant = "primary",
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  variant?: "primary" | "secondary";
  disabled?: boolean;
}) {
  return (
    <Button variant={variant} disabled={disabled} onClick={onClick}>
      {label}
    </Button>
  );
}

export function PBtn({
  label,
  onClick,
  disabled = false,
  variant = "primary",
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: "primary" | "ghost";
}) {
  const mapped: NidoButtonVariant = variant === "ghost" ? "ghost" : "primary";
  return (
    <Button variant={mapped} disabled={disabled} onClick={onClick} style={variant === "ghost" ? { color: P.muted } : undefined}>
      {label}
    </Button>
  );
}
