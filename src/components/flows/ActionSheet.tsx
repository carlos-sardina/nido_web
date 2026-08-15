import { ChevronRight } from "lucide-react";
import { P } from "@/lib/palette";
import type { Flow } from "@/lib/types";
import { PBtn } from "@/components/shared/PBtn";

export function ActionSheet({ onSelect, onClose }: { onSelect: (f: Flow) => void; onClose: () => void }) {
  const actions: { flow: Flow; emoji: string; label: string; sub: string }[] = [
    { flow: "expense", emoji: "💸", label: "Registrar un gasto",     sub: "Compartido o personal"     },
    { flow: "goal",    emoji: "🎯", label: "Crear una meta",         sub: "Ahorra para algo especial" },
    { flow: "contrib", emoji: "💰", label: "Registrar una aportación",sub: "Agrega dinero a una meta" },
  ];
  return (
    <>
      <div className="absolute inset-0 z-40" style={{ backgroundColor: "rgba(47,42,40,0.40)" }} onClick={onClose} />
      <div className="absolute bottom-0 left-0 right-0 z-50 rounded-t-[2rem] pt-3 pb-8" style={{ backgroundColor: P.card }}>
        <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ backgroundColor: P.sub }} />
        <div className="px-5">
          <p className="text-xs font-semibold text-center mb-4" style={{ color: P.muted }}>¿Qué quieres hacer?</p>
          <div className="space-y-2 mb-4">
            {actions.map(a => (
              <button key={a.flow} onClick={() => onSelect(a.flow)}
                className="w-full flex items-center gap-4 p-4 rounded-2xl text-left transition-all active:scale-[0.99]"
                style={{ backgroundColor: P.bg }}>
                <span className="text-2xl w-9 text-center">{a.emoji}</span>
                <div>
                  <p className="text-sm font-semibold" style={{ color: P.text }}>{a.label}</p>
                  <p className="text-[10px]" style={{ color: P.muted }}>{a.sub}</p>
                </div>
                <ChevronRight size={14} style={{ color: P.muted, marginLeft: "auto" }} />
              </button>
            ))}
          </div>
          <PBtn label="Cancelar" onClick={onClose} variant="ghost" />
        </div>
      </div>
    </>
  );
}
