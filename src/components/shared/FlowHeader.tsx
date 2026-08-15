import { ChevronLeft, X } from "lucide-react";
import { P } from "@/lib/palette";

export function FlowHeader({ step, total, onBack, onClose }: { step: number; total: number; onBack: () => void; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between px-5 pt-4 pb-2 flex-shrink-0">
      <button onClick={onBack} className="w-9 h-9 rounded-full flex items-center justify-center" style={{ backgroundColor: P.sub }}>
        <ChevronLeft size={16} style={{ color: P.text }} />
      </button>
      <div className="flex gap-1.5">
        {Array.from({ length: total }).map((_, i) => (
          <div key={i} className="h-1 rounded-full transition-all" style={{ width: i < step ? 20 : 14, backgroundColor: i < step ? P.brnDk : P.sub }} />
        ))}
      </div>
      <button onClick={onClose} className="w-9 h-9 rounded-full flex items-center justify-center" style={{ backgroundColor: P.sub }}>
        <X size={16} style={{ color: P.text }} />
      </button>
    </div>
  );
}
