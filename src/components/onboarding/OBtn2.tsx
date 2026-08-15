import { P } from "@/lib/palette";

export function OBtn2({ label, onClick, variant = "primary", disabled = false }: { label: string; onClick: () => void; variant?: "primary"|"secondary"; disabled?: boolean }) {
  return (
    <button onClick={disabled ? undefined : onClick} className="w-full py-4 rounded-2xl font-semibold text-sm transition-all active:scale-[0.98]"
      style={variant === "primary"
        ? { backgroundColor: disabled ? P.sub : P.brnDk, color: disabled ? P.muted : "#fff", cursor: disabled ? "not-allowed" : "pointer" }
        : { backgroundColor: P.sub, color: P.text }}>
      {label}
    </button>
  );
}
