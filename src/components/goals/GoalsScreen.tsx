import { Clock } from "lucide-react";
import { GOALS } from "@/lib/constants";
import { $k, pct } from "@/lib/helpers";
import { P } from "@/lib/palette";

export function GoalsScreen() {
  const totalSaved = GOALS.reduce((s, g) => s + g.current, 0);
  return (
    <div className="h-full overflow-y-auto [&::-webkit-scrollbar]:hidden">
      <div className="px-6 pt-3 pb-1 flex items-center justify-between">
        <div>
          <h2 className="text-[22px] font-bold" style={{ fontFamily: "Fraunces, serif", color: P.text }}>Metas</h2>
          <p className="text-xs" style={{ color: P.muted }}>4 activas · {$k(totalSaved)} ahorrados</p>
        </div>
      </div>
      <div className="mx-6 my-3 rounded-[1.5rem] p-5 shadow-sm" style={{ backgroundColor: P.card }}>
        <p className="text-[10px] mb-1" style={{ color: P.muted }}>Total en metas</p>
        <p className="text-[26px] font-bold mb-3" style={{ fontFamily: "Fraunces, serif", color: P.text }}>{$k(totalSaved)}</p>
        <div className="flex gap-0.5 h-2.5 rounded-full overflow-hidden">
          {GOALS.map(g => <div key={g.name} style={{ flex: g.current, backgroundColor: g.color }} />)}
        </div>
        <div className="flex flex-wrap gap-3 mt-3">
          {GOALS.map(g => (
            <div key={g.name} className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: g.color }} />
              <span className="text-[9px]" style={{ color: P.muted }}>{g.emoji} {g.name.split(" ")[0]}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="px-6 space-y-3 pb-6">
        {GOALS.map(g => {
          const progress = pct(g.current, g.target);
          return (
            <div key={g.name} className="rounded-[1.5rem] overflow-hidden shadow-sm" style={{ backgroundColor: g.bg }}>
              <div className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <span className="text-3xl">{g.emoji}</span>
                    <h4 className="text-sm font-bold mt-1" style={{ color: P.text }}>{g.name}</h4>
                    <p className="text-[9px] mt-0.5" style={{ color: P.muted }}>{g.members}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px]" style={{ color: P.muted }}>Meta</p>
                    <p className="text-sm font-bold" style={{ color: P.text }}>{$k(g.target)}</p>
                  </div>
                </div>
                <div className="flex items-baseline gap-2 mb-3">
                  <span className="text-xl font-bold" style={{ fontFamily: "Fraunces, serif", color: P.text }}>{$k(g.current)}</span>
                  <span className="text-[10px]" style={{ color: P.muted }}>ahorrados</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden mb-3" style={{ backgroundColor: "rgba(0,0,0,0.06)" }}>
                  <div className="h-full rounded-full" style={{ width: `${progress}%`, backgroundColor: g.color }} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: g.color }} />
                    <span className="text-[10px]" style={{ color: P.muted }}>{$k(g.monthly)}/mes</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock size={9} style={{ color: P.muted }} />
                    <span className="text-[10px]" style={{ color: P.muted }}>{g.date}</span>
                  </div>
                </div>
              </div>
              <div className="px-5 pb-4">
                <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold"
                  style={{ backgroundColor: g.color + "22", color: g.color }}>{progress}% completado</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
