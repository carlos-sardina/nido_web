import { P } from "@/lib/palette";

export function ScopeTag({
  kind,
  label,
  compact = false,
}: {
  kind: "personal" | "nido";
  label?: string;
  compact?: boolean;
}) {
  const personal = kind === "personal";
  return (
    <span
      className={`inline-block max-w-full truncate text-[9px] font-semibold uppercase rounded-full py-0.5 leading-none ${
        compact ? "px-1 tracking-normal" : "px-1.5 tracking-wide"
      }`}
      style={{
        backgroundColor: personal ? "#FDEEF1" : "#E8F4EF",
        color: personal ? P.brnDp : P.sageDk,
      }}
    >
      {label ?? (personal ? "Personal" : "Nido")}
    </span>
  );
}
