import { ChevronLeft } from "lucide-react";
import type { AuthIdentity } from "@/lib/auth/identity";
import { DIANA_EXTRAS, DIANA_ITEMS } from "@/lib/constants";
import { $k } from "@/lib/helpers";
import { P } from "@/lib/palette";

export function ProfilePanel({
  identity,
  onClose,
  onLogout,
  signingOut = false,
}: {
  identity: AuthIdentity | null;
  onClose: () => void;
  onLogout: () => void;
  signingOut?: boolean;
}) {
  const fixedTotal = DIANA_ITEMS.reduce((s, i) => s + i.amount, 0);
  const extraTotal = DIANA_EXTRAS.reduce((s, i) => s + i.amount, 0);
  return (
    <div className="absolute inset-0 z-40 flex flex-col" style={{ backgroundColor: P.bgL }}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-4 pb-3 flex-shrink-0 border-b" style={{ borderColor: P.border }}>
        <button onClick={onClose} className="w-9 h-9 rounded-full flex items-center justify-center active:scale-95 transition-transform" style={{ backgroundColor: P.sub }}>
          <ChevronLeft size={18} style={{ color: P.text }} />
        </button>
        <h2 className="text-sm font-bold" style={{ fontFamily: "Fraunces, serif", color: P.text }}>Mi perfil</h2>
        <div className="w-9" />
      </div>

      <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden pb-6">
        {/* User identity */}
        <div className="flex flex-col items-center py-6 px-6">
          <div className="w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-bold mb-3 shadow-md overflow-hidden" style={{ backgroundColor: P.sage }}>
            {identity?.avatarUrl
              ? <img src={identity.avatarUrl} alt="" className="w-full h-full object-cover" />
              : (identity?.initials ?? "?")}
          </div>
          <p className="text-base font-bold mb-0.5" style={{ fontFamily: "Fraunces, serif", color: P.text }}>{identity?.displayName ?? "Usuario"}</p>
          <p className="text-xs" style={{ color: P.muted }}>{identity?.email ?? ""}</p>
          <div className="mt-2 px-3 py-1 rounded-full text-[10px] font-semibold" style={{ backgroundColor: P.sagePl, color: P.brnDp }}>Nido: Departamento 🏠</div>
        </div>

        {/* Fixed personal expenses */}
        <div className="px-6 mb-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold uppercase tracking-widest" style={{ color: P.muted }}>Gastos fijos personales</h3>
            <span className="text-xs font-bold" style={{ color: P.text }}>{$k(fixedTotal)}/mes</span>
          </div>
          <div className="rounded-2xl overflow-hidden shadow-sm" style={{ backgroundColor: P.card }}>
            {DIANA_ITEMS.map((item, idx) => (
              <div key={item.name} className="flex items-center gap-3 px-4 py-3"
                style={{ borderTop: idx === 0 ? "none" : `1px solid ${P.border}` }}>
                <span className="text-base w-7 text-center flex-shrink-0">{item.icon}</span>
                <p className="flex-1 text-xs font-medium" style={{ color: P.text }}>{item.name}</p>
                <p className="text-xs font-semibold tabular-nums" style={{ color: P.text }}>{$k(item.amount)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Extra this month */}
        <div className="px-6 mb-8">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold uppercase tracking-widest" style={{ color: P.muted }}>Extra este mes</h3>
            <span className="text-xs font-bold" style={{ color: P.text }}>{$k(extraTotal)}</span>
          </div>
          <div className="rounded-2xl overflow-hidden shadow-sm" style={{ backgroundColor: P.card }}>
            {DIANA_EXTRAS.map((item, idx) => (
              <div key={item.name} className="flex items-center gap-3 px-4 py-3"
                style={{ borderTop: idx === 0 ? "none" : `1px solid ${P.border}` }}>
                <span className="text-base w-7 text-center flex-shrink-0">{item.icon}</span>
                <div className="flex-1">
                  <p className="text-xs font-medium" style={{ color: P.text }}>{item.name}</p>
                  <p className="text-[10px]" style={{ color: P.muted }}>{item.date}</p>
                </div>
                <p className="text-xs font-semibold tabular-nums" style={{ color: P.text }}>{$k(item.amount)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Logout */}
        <div className="px-6">
          <button onClick={signingOut ? undefined : onLogout}
            disabled={signingOut}
            className="w-full py-3.5 rounded-2xl text-sm font-semibold border transition-all active:scale-[0.98]"
            style={{ color: P.danger, borderColor: `${P.danger}30`, backgroundColor: P.dangerBg, opacity: signingOut ? 0.7 : 1, cursor: signingOut ? "not-allowed" : "pointer" }}>
            {signingOut ? "Cerrando sesión…" : "Cerrar sesión"}
          </button>
        </div>
      </div>
    </div>
  );
}
