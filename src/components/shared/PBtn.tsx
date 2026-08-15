import { P } from "@/lib/palette";

export function PBtn({ label, onClick, disabled = false, variant = "primary" }: {
  label: string; onClick: () => void; disabled?: boolean; variant?: "primary" | "ghost";
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="w-full py-4 rounded-2xl font-semibold text-sm transition-all active:scale-[0.98]"
      style={variant === "primary"
        ? { backgroundColor: disabled ? P.sub : P.brnDk, color: disabled ? P.muted : "#fff" }
        : { backgroundColor: "transparent", color: P.muted, border: `1px solid ${P.border}` }}>
      {label}
    </button>
  );
}
