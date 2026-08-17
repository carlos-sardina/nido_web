import { P } from "@/lib/palette";

export function OProgress2({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex gap-1.5 mb-6" aria-hidden="true">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className="h-1 flex-1 rounded-full transition-all"
          style={{ backgroundColor: i < step ? P.brnDk : P.sub }}
        />
      ))}
    </div>
  );
}
