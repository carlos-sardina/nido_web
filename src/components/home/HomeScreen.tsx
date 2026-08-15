import { Shield } from "lucide-react";
import { CATS, FEED, GOALS, TOT_B, TOT_S } from "@/lib/constants";
import { $k, pct } from "@/lib/helpers";
import { P } from "@/lib/palette";
import type { Tab } from "@/lib/types";
import { HealthGauge } from "@/components/home/HealthGauge";

export function HomeScreen({ onProfileOpen, onNavigate }: { onProfileOpen: () => void; onNavigate: (tab: Tab) => void }) {
  const over = TOT_S > TOT_B;
  const diff = Math.abs(TOT_S - TOT_B);
  return (
    <div className="h-full overflow-y-auto [&::-webkit-scrollbar]:hidden pb-4">
      <div className="px-6 pt-3 pb-1 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium" style={{ color: P.muted }}>Buenos días</p>
          <h1 className="text-[22px] font-bold" style={{ fontFamily: "Fraunces, serif", color: P.text }}>Diana 👋</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onProfileOpen} className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-sm active:scale-95 transition-transform" style={{ backgroundColor: P.sage }}>DV</button>
        </div>
      </div>
      {/* Health score */}
      <div className="mx-6 mb-3 rounded-[1.5rem] overflow-hidden" style={{ background: "linear-gradient(135deg, #255D4D 0%, #2F7D66 100%)" }}>
        <div className="p-5">
          <div className="flex items-start justify-between mb-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest mb-0.5" style={{ color: "rgba(255,255,255,0.45)" }}>Salud Financiera</p>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold" style={{ color: P.sageLt }}>Excelente</span>
                <span className="text-[10px] rounded-full px-2 py-0.5 font-medium" style={{ backgroundColor: `${P.sageLt}25`, color: P.sageLt }}>↑ +3 pts</span>
              </div>
            </div>
            <span className="text-[10px] font-medium" style={{ color: "rgba(255,255,255,0.3)" }}>Junio 2026</span>
          </div>
          <div className="flex items-end justify-between gap-4">
            <HealthGauge score={92} />
            <div className="flex flex-col gap-2">
              {[
                { label: "Tasa ahorro",  value: "18%"     },
                { label: "Fondo emerg.", value: "4.2 mes" },
              ].map(s => (
                <div key={s.label} className="rounded-xl px-3 py-2 flex items-center gap-2.5" style={{ backgroundColor: "rgba(255,255,255,0.1)" }}>
                  <span className="text-xs font-bold" style={{ color: P.sageLt }}>{s.value}</span>
                  <span className="text-[9px]" style={{ color: "rgba(255,255,255,0.4)" }}>{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      {/* Budget */}
      <div className="mx-6 mb-3 rounded-[1.5rem] p-5 shadow-sm" style={{ backgroundColor: P.card }}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold" style={{ color: P.text }}>Presupuesto del mes</h3>
          <span className="text-[10px]" style={{ color: P.muted }}>Junio 2026</span>
        </div>
        <div className="flex items-baseline gap-2 mb-3">
          <span className="text-[22px] font-bold" style={{ fontFamily: "Fraunces, serif", color: P.text }}>{$k(TOT_S)}</span>
          <span className="text-xs" style={{ color: P.muted }}>de {$k(TOT_B)}</span>
        </div>
        <div className="h-2 rounded-full overflow-hidden mb-2" style={{ backgroundColor: P.sub }}>
          <div className="h-full rounded-full" style={{ width: `${pct(TOT_S, TOT_B)}%`, background: over ? P.danger : `linear-gradient(90deg, ${P.sage}, ${P.sageDk})` }} />
        </div>
        <div className="flex justify-between text-[10px]">
          <span style={{ color: P.muted }}>Gastado este mes</span>
          <span className="font-semibold" style={{ color: over ? P.danger : P.sageDk }}>
            {over ? `$${diff.toLocaleString("es-MX")} sobre el plan` : `$${diff.toLocaleString("es-MX")} disponible`}
          </span>
        </div>
        <div className="flex gap-2 mt-4 overflow-x-auto [&::-webkit-scrollbar]:hidden">
          {CATS.slice(0, 5).map(c => (
            <div key={c.name} className="flex-shrink-0 rounded-xl px-3 py-2 text-center min-w-[58px]" style={{ backgroundColor: P.sub }}>
              <div className="text-sm mb-0.5">{c.icon}</div>
              <div className="text-[9px] mb-0.5" style={{ color: P.muted }}>{c.name.split(" ")[0]}</div>
              <div className="text-[10px] font-bold" style={{ color: c.spent > c.budget ? P.danger : P.text }}>{$k(c.spent)}</div>
            </div>
          ))}
        </div>
      </div>
      {/* Emergency fund */}
      <div className="mx-6 mb-3 rounded-[1.5rem] p-4 shadow-sm" style={{ backgroundColor: P.card }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ backgroundColor: "#E8F4EF" }}>
              <Shield size={17} style={{ color: P.sageDk }} />
            </div>
            <div>
              <p className="text-[10px]" style={{ color: P.muted }}>Fondo de emergencia</p>
              <p className="text-base font-bold" style={{ fontFamily: "Fraunces, serif", color: P.text }}>$120,000</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px]" style={{ color: P.muted }}>Cubre</p>
            <p className="text-sm font-bold" style={{ color: P.sageDk }}>4.2 meses</p>
          </div>
        </div>
        <div className="mt-3 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: P.sub }}>
          <div className="h-full w-[60%] rounded-full" style={{ background: `linear-gradient(90deg, ${P.sage}, ${P.sageDk})` }} />
        </div>
        <div className="flex justify-between mt-1 text-[9px]" style={{ color: P.muted }}><span>$120k de $200k</span><span>60%</span></div>
      </div>
      {/* Goals preview */}
      <div className="mb-3">
        <div className="flex items-center justify-between px-6 mb-2">
          <h3 className="text-xs font-semibold" style={{ color: P.text }}>Metas activas</h3>
          <button onClick={() => onNavigate("goals")} className="text-[10px] font-semibold" style={{ color: P.brnDk }}>Ver todas →</button>
        </div>
        <div className="flex gap-3 px-6 overflow-x-auto [&::-webkit-scrollbar]:hidden pb-1">
          {GOALS.map(g => (
            <div key={g.name} className="flex-shrink-0 w-36 rounded-2xl p-3.5" style={{ backgroundColor: g.bg }}>
              <div className="text-2xl mb-1.5">{g.emoji}</div>
              <p className="text-[10px] font-semibold leading-tight mb-2" style={{ color: P.text }}>{g.name}</p>
              <div className="h-1 rounded-full overflow-hidden mb-1" style={{ backgroundColor: "rgba(0,0,0,0.06)" }}>
                <div className="h-full rounded-full" style={{ width: `${pct(g.current, g.target)}%`, backgroundColor: g.color }} />
              </div>
              <div className="flex justify-between text-[9px]" style={{ color: P.muted }}>
                <span>{pct(g.current, g.target)}%</span><span>{g.date}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* Activity */}
      <div className="px-6 mb-2">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold" style={{ color: P.text }}>Actividad reciente</h3>
          <button onClick={() => onNavigate("activity")} className="text-[10px] font-semibold" style={{ color: P.brnDk }}>Ver todo →</button>
        </div>
        <div className="space-y-2">
          {FEED.slice(0, 3).map((item, i) => (
            <div key={i} className="flex items-center gap-3 rounded-2xl p-3 shadow-sm" style={{ backgroundColor: P.card }}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0" style={{ backgroundColor: P.sub }}>{item.icon}</div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate" style={{ color: P.text }}>
                  {"user" in item && item.user ? <><span className="font-bold">{item.user}</span> {item.action}</> : item.action}
                </p>
                <p className="text-[10px]" style={{ color: P.muted }}>{item.time}</p>
              </div>
              {"amount" in item && item.amount !== undefined && (
                <span className="text-xs font-semibold flex-shrink-0" style={{ color: P.text }}>{$k(item.amount)}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
