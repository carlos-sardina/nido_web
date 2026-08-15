import { Sparkles } from "lucide-react";
import { FEED } from "@/lib/constants";
import { $k } from "@/lib/helpers";
import { P } from "@/lib/palette";

export function ActivityScreen() {
  return (
    <div className="h-full overflow-y-auto [&::-webkit-scrollbar]:hidden">
      <div className="px-6 pt-3 pb-1">
        <h2 className="text-[22px] font-bold" style={{ fontFamily: "Fraunces, serif", color: P.text }}>Actividad</h2>
        <p className="text-xs" style={{ color: P.muted }}>Línea de tiempo del hogar</p>
      </div>
      <div className="mx-6 my-3 rounded-[1.5rem] overflow-hidden" style={{ background: "linear-gradient(135deg, #255D4D 0%, #2F7D66 100%)" }}>
        <div className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={13} style={{ color: P.sageLt }} />
            <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: P.sageLt }}>Bienestar financiero</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[{ label: "Meses sin ingreso", value: "7.2" }, { label: "Ingreso comprometido", value: "78%" }, { label: "Balance aportación", value: "Óptimo" }].map(s => (
              <div key={s.label} className="rounded-xl p-2.5 text-center" style={{ backgroundColor: "rgba(255,255,255,0.1)" }}>
                <p className="text-sm font-bold text-white" style={{ fontFamily: "Fraunces, serif" }}>{s.value}</p>
                <p className="text-[9px] mt-0.5 leading-tight" style={{ color: "rgba(255,255,255,0.4)" }}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="px-6 pb-6 relative">
        <div className="absolute top-0 bottom-0 w-px" style={{ left: "2.125rem", backgroundColor: P.sub }} />
        <div className="space-y-3">
          {FEED.map((item, i) => {
            const isAlert = item.type === "alert";
            const isMilestone = item.type === "milestone" || item.type === "insight";
            return (
              <div key={i} className="flex gap-3 items-start">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 z-10 text-sm shadow-sm"
                  style={{ backgroundColor: isAlert ? P.warnBg : isMilestone ? P.sagePl : P.card }}>
                  {item.icon}
                </div>
                <div className="flex-1 rounded-2xl p-3 shadow-sm"
                  style={{ backgroundColor: isAlert ? P.warnBg : isMilestone ? P.sagePl : P.card, border: `1px solid ${P.border}` }}>
                  <p className="text-xs font-medium leading-snug" style={{ color: P.text }}>
                    {"user" in item && item.user ? <><span className="font-bold">{item.user}</span> {item.action}</> : item.action}
                  </p>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[9px]" style={{ color: P.muted }}>{item.time}</span>
                    {"amount" in item && item.amount !== undefined && (
                      <span className="text-[10px] font-bold" style={{ color: P.text }}>{$k(item.amount)}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
