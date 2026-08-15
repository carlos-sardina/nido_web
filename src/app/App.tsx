import { useState } from "react";
import {
  Home, BarChart2, Target, Users, Clock, Plus, X,
  ChevronRight, ChevronLeft, Sparkles, Shield,
  AlertTriangle, Check, Link, Mail,
  Camera, Receipt,
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

// ── PALETTE ───────────────────────────────────────────────────────────────────
// 70% warm cream · 20% emerald green · 10% dusty rose + terracotta accents
// Inspired by: warm home, natural light, plants, wood furniture, Sunday morning
const P = {
  bg:       "#F8F5F0",   // warm cream — main background
  bgL:      "#FFFCFA",   // ivory — card surfaces & flow screens
  card:     "#FFFCFA",   // ivory white cards (not cold white)

  // ── Emerald (semantic success — savings, health, positive financial data) ──
  sage:     "#2F7D66",   // emerald — savings, health score, positive indicators
  sageDk:   "#255D4D",   // emerald dark — gradients, hover on financial elements
  sageLt:   "#A9C8A6",   // warm sage — success backgrounds, positive chart fills
  sagePl:   "#FDEEF1",   // pale rose — selected chips, input focus, interactive states

  // ── Dusty Rose (primary brand — buttons, nav, FAB, CTAs, highlights) ─────
  brn:      "#D88D9A",   // dusty rose — secondary accents
  brnDk:    "#D88D9A",   // dusty rose PRIMARY — all primary buttons, nav active, FAB
  brnDp:    "#B87485",   // dark rose — depth on primary elements, pressed states

  // ── Terracotta (warning — budget alerts, overspending) ───────────────────
  warn:     "#C9785D",   // terracotta — budget exceeded, attention states
  warnBg:   "#FAF0EC",   // terracotta pale bg

  // ── Neutral system ───────────────────────────────────────────────────────
  text:     "#2F2A28",   // warm charcoal — primary text
  muted:    "#746C67",   // warm gray — secondary text, placeholders
  sub:      "#EDE7E0",   // subtle surface — input backgrounds, dividers
  border:   "rgba(47,42,40,0.08)",

  // ── System ───────────────────────────────────────────────────────────────
  danger:   "#B94040",   // only for truly critical states
  dangerBg: "#FDEAEA",
};

// ── TYPES ────────────────────────────────────────────────────────────────────
type AppMode = "onboarding" | "app";
type OStep   = "welcome"|"auth"|"join"|"c-type"|"c-name"|"c-invite"|
               "p-name"|"p-income"|"p-savings"|"p-expenses"|"p-contrib"|"nest-ready";
type Tab     = "home"|"budget"|"goals"|"household"|"activity";
type Model   = "equal"|"proportional"|"capacity";
type Flow    = null|"expense"|"goal"|"contrib";

// ── DATA ─────────────────────────────────────────────────────────────────────
const D_INC = 69000, D_PER = 20675, D_CAP = D_INC - D_PER;
const C_INC = 30000, C_PER = 5000,  C_CAP = C_INC - C_PER;
const T_INC = D_INC + C_INC, T_CAP = D_CAP + C_CAP;

const DIANA_ITEMS = [
  { name: "Pago auto",      amount: 12000, icon: "🚗" },
  { name: "Seguro médico",  amount: 1702,  icon: "🏥" },
  { name: "Fondo retiro",   amount: 2414,  icon: "📈" },
  { name: "Terapia",        amount: 800,   icon: "💆" },
  { name: "Gastos médicos", amount: 1000,  icon: "💊" },
  { name: "Deezer",         amount: 240,   icon: "🎵" },
  { name: "Google One",     amount: 169,   icon: "📧" },
  { name: "YouTube",        amount: 280,   icon: "▶️" },
  { name: "Móvil",          amount: 70,    icon: "📱" },
  { name: "Mascotas",       amount: 2000,  icon: "🐾" },
];

const CATS = [
  { name: "Renta",        icon: "🏠", budget: 20000, spent: 20000, color: "#8BA89E" },
  { name: "Restaurantes", icon: "🍔", budget: 6000,  spent: 7200,  color: P.brn     },
  { name: "Supermercado", icon: "🛒", budget: 4000,  spent: 5200,  color: P.sage    },
  { name: "Limpieza",     icon: "🧹", budget: 1000,  spent: 1000,  color: P.sageLt  },
  { name: "Gasolina",     icon: "⛽", budget: 1000,  spent: 850,   color: "#D8B86A" },
  { name: "Internet",     icon: "📡", budget: 700,   spent: 700,   color: "#6BAAA0" },
  { name: "Casetas",      icon: "🛣️", budget: 500,   spent: 320,   color: "#B0A898" },
  { name: "Gas",          icon: "🔥", budget: 200,   spent: 167,   color: "#C9785D" },
  { name: "Luz",          icon: "💡", budget: 200,   spent: 0,     color: "#D8B86A" },
];
const TOT_B = CATS.reduce((s, c) => s + c.budget, 0);
const TOT_S = CATS.reduce((s, c) => s + c.spent, 0);

const GOALS = [
  { name: "Fondo de emergencia", emoji: "🛡️", target: 200000, current: 120000, monthly: 5000, date: "Oct 2026",  color: "#2F7D66", bg: "#E8F4EF", members: "Diana & Carlos" },
  { name: "Viaje a Japón",       emoji: "✈️",  target: 80000,  current: 28000,  monthly: 4000, date: "Mar 2027",  color: "#D88D9A", bg: "#FDEEF1", members: "Diana & Carlos" },
  { name: "Enganche casa",       emoji: "🏡",  target: 500000, current: 45000,  monthly: 8000, date: "Dic 2030",  color: "#A9C8A6", bg: "#EFF5EE", members: "Diana & Carlos" },
  { name: "Fondo Mochi",         emoji: "🐶",  target: 20000,  current: 12000,  monthly: 2000, date: "Mayo 2026", color: "#C9785D", bg: "#FAF0EC", members: "Diana" },
];

const FEED = [
  { user: "Carlos", action: "pagó Internet",       amount: 700,   time: "Hace 2h",     icon: "📡", type: "expense"   },
  { user: "Diana",  action: "compró supermercado", amount: 1200,  time: "Hace 5h",     icon: "🛒", type: "expense"   },
  {                 action: "Fondo emergencia al 60%",            time: "Ayer",         icon: "🛡️", type: "milestone" },
  { user: "Diana",  action: "pagó renta",          amount: 20000, time: "Hace 2 días", icon: "🏠", type: "expense"   },
  {                 action: "Restaurantes sobre plan",            time: "Hace 3 días", icon: "⚠️", type: "alert"     },
  { user: "Carlos", action: "aportó a Japón",      amount: 4000,  time: "Hace 4 días", icon: "✈️", type: "goal"      },
  {                 action: "Ahorraron $12k este mes",            time: "Hace 5 días", icon: "✨", type: "insight"   },
];

const LIFE_EVENTS = [
  { emoji: "🏡", name: "Comprar casa",    active: false },
  { emoji: "👶", name: "Tener un bebé",   active: false },
  { emoji: "🚗", name: "Nuevo auto",      active: false },
  { emoji: "🐶", name: "Adoptar mascota", active: true  },
  { emoji: "💍", name: "Boda",            active: false },
  { emoji: "✈️", name: "Vacaciones",      active: true  },
  { emoji: "🎓", name: "Maestría",        active: false },
  { emoji: "💼", name: "Negocio propio",  active: false },
];

const EXP_CATS = [
  { name: "Vivienda",        icon: "🏠" }, { name: "Despensa",   icon: "🛒" },
  { name: "Restaurantes",    icon: "🍔" }, { name: "Transporte", icon: "🚗" },
  { name: "Mascotas",        icon: "🐶" }, { name: "Servicios",  icon: "⚡" },
  { name: "Limpieza",        icon: "🧹" }, { name: "Entretenim.", icon: "🎬" },
  { name: "Salud",           icon: "❤️" }, { name: "Educación",  icon: "🎓" },
  { name: "Trabajo",         icon: "💼" }, { name: "Otra",       icon: "➕" },
];

const GOAL_TYPES = [
  { name: "Fondo emerg.", emoji: "🛟" }, { name: "Vacaciones", emoji: "✈️" },
  { name: "Casa",         emoji: "🏠" }, { name: "Auto",       emoji: "🚗" },
  { name: "Muebles",      emoji: "🛋️" }, { name: "Mascotas",   emoji: "🐶" },
  { name: "Bebé",         emoji: "👶" }, { name: "Educación",  emoji: "🎓" },
  { name: "Boda",         emoji: "💍" }, { name: "Inversión",  emoji: "📈" },
  { name: "Personalizada",emoji: "✨" },
];

const QUICK_AMOUNTS: Record<string, number[]> = {
  "Renta":              [8000, 12000, 18000, 25000],
  "Supermercado":       [2000,  4000,  6000,  8000],
  "Restaurantes":       [2000,  4000,  6000, 10000],
  "Gasolina":           [ 500,  1000,  2000,  3000],
  "Internet":           [ 400,   600,   800,  1200],
  "Pago auto":          [3000,  6000, 10000, 15000],
  "Tarjeta de crédito": [1000,  3000,  5000, 10000],
  "Suscripciones":      [ 200,   500,   800,  1500],
  "Limpieza":           [ 500,   800,  1000,  1500],
  "Mascotas":           [ 500,  1000,  2000,  3000],
  "Luz":                [ 200,   400,   600,  1000],
  "Gas":                [ 200,   400,   600,  1000],
  "Agua":               [ 100,   200,   300,   500],
  "Casetas":            [ 200,   400,   600,  1000],
  "Seguro médico":      [ 500,  1000,  2000,  3000],
  "Retiro":             [1000,  2000,  3000,  5000],
  "Terapia":            [ 500,   800,  1000,  1500],
  "Gym":                [ 300,   500,   800,  1200],
};
const DEFAULT_QUICK = [500, 1000, 2000, 5000];

const FREQUENCIES = ["Único","Semanal","Quincenal","Mensual","Bimestral","Semestral","Anual"];

const SAVE_METHODS = [
  { label: "Automáticamente cada mes", icon: "🔄" },
  { label: "Cada quien decide cuándo", icon: "🕐" },
  { label: "Aportación fija",          icon: "💰" },
  { label: "Aportación proporcional",  icon: "📊" },
  { label: "Según capacidad",          icon: "💡" },
];

const NIDO_NAMES = [
  "Nuestro Hogar",
  "Departamento",
  "Casa",
  "Nido",
  "El Refugio",
  "Tribu",
  "Comunidad",
  "La Madriguera",
  "Hogar García",
  "Casa Ramírez",
];

// ── HELPERS ──────────────────────────────────────────────────────────────────
const $k  = (n: number) => n >= 1000 ? `$${(n/1000).toFixed(n%1000===0?0:1)}k` : `$${n.toLocaleString("es-MX")}`;
const pct = (a: number, b: number) => Math.min(100, Math.round((a/b)*100));

// ── HOUSE ILLUSTRATION ───────────────────────────────────────────────────────
function NidoHouse({ showCarlos = false }: { showCarlos?: boolean }) {
  return (
    <svg viewBox="0 0 300 230" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full max-w-[260px] mx-auto">
      <ellipse cx="150" cy="210" rx="120" ry="16" fill={P.border} />
      <rect x="75" y="120" width="150" height="90" rx="6" fill="#FFFFFF" />
      <path d="M60 126 L150 54 L240 126 Z" fill={P.brnDk} />
      <rect x="180" y="72" width="20" height="36" rx="4" fill={P.brn} />
      <path d="M177 76 Q187 64 199 76" stroke={P.sageLt} strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.8" />
      <rect x="128" y="152" width="44" height="58" rx="22" fill={P.brnDk} />
      <circle cx="163" cy="183" r="3" fill={P.bgL} />
      <rect x="86" y="136" width="40" height="34" rx="10" fill={P.sub} />
      <line x1="106" y1="136" x2="106" y2="170" stroke="#FFF" strokeWidth="1.5" />
      <line x1="86"  y1="153" x2="126" y2="153" stroke="#FFF" strokeWidth="1.5" />
      <rect x="174" y="136" width="40" height="34" rx="10" fill={P.sub} />
      <line x1="194" y1="136" x2="194" y2="170" stroke="#FFF" strokeWidth="1.5" />
      <line x1="174" y1="153" x2="214" y2="153" stroke="#FFF" strokeWidth="1.5" />
      <path d="M128 210 Q150 204 172 210" stroke={P.sub} strokeWidth="5" fill="none" strokeLinecap="round" />
      <circle cx="46" cy="160" r="16" fill={P.sage} />
      <path d="M30 210 Q46 190 62 210" fill={P.sageDk} />
      {showCarlos ? (
        <>
          <circle cx="254" cy="160" r="16" fill="#5A9E90" />
          <path d="M238 210 Q254 190 270 210" fill="#437A74" />
        </>
      ) : (
        <>
          <circle cx="254" cy="160" r="16" fill={P.sub} stroke={P.border} strokeWidth="2" strokeDasharray="4 3" />
          <text x="254" y="165" textAnchor="middle" fill={P.muted} fontSize="14">?</text>
        </>
      )}
      <circle cx="72"  cy="204" r="9" fill={P.sageLt} />
      <rect   x="69"  y="204" width="6" height="14" rx="3" fill={P.sage} />
      <circle cx="228" cy="204" r="9" fill={P.sageLt} />
      <rect   x="225" y="204" width="6" height="14" rx="3" fill={P.sage} />
      <circle cx="35"  cy="80" r="3" fill={P.sageLt} opacity="0.6" />
      <circle cx="265" cy="70" r="2.5" fill={P.sageLt} opacity="0.5" />
      <circle cx="255" cy="100" r="2" fill={P.sageLt} opacity="0.4" />
    </svg>
  );
}

// ── SHARED UI PRIMITIVES ──────────────────────────────────────────────────────
function FlowHeader({ step, total, onBack, onClose }: { step: number; total: number; onBack: () => void; onClose: () => void }) {
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

function PBtn({ label, onClick, disabled = false, variant = "primary" }: {
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

// ── ACTION SHEET ──────────────────────────────────────────────────────────────
function ActionSheet({ onSelect, onClose }: { onSelect: (f: Flow) => void; onClose: () => void }) {
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

// ── EXPENSE FLOW ──────────────────────────────────────────────────────────────
function ExpenseFlow({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [step, setStep] = useState(1);
  const [shared, setShared]   = useState<boolean | null>(null);
  const [cat, setCat]         = useState("");
  const [amount, setAmount]   = useState("4280");
  const [desc, setDesc]       = useState("Super Walmart");
  const [freq, setFreq]       = useState("Único");
  const [paidBy, setPaidBy]   = useState<"diana"|"carlos"|"both">("diana");
  const [split, setSplit]     = useState<"capacity"|"income"|"equal"|"custom">("capacity");

  const totalSteps = shared === false ? 4 : 5;
  const back = () => step > 1 ? setStep(s => s - 1) : onClose();
  const next = () => {
    if (step === 1 && shared === false) setStep(3); // skip category for personal
    else setStep(s => s + 1);
  };
  const save = () => onDone();

  const dianaPct = split === "equal" ? 50 : split === "income" ? Math.round(D_INC/T_INC*100) : Math.round(D_CAP/T_CAP*100);
  const carlosPct = 100 - dianaPct;
  const amt = parseFloat(amount) || 0;
  const dianaAmt = Math.round(amt * dianaPct / 100);
  const carlosAmt = amt - dianaAmt;

  const budgetCat = CATS.find(c => c.name.toLowerCase().includes((cat || "supermercado").toLowerCase().slice(0,5))) || CATS[2];
  const newSpent  = budgetCat.spent + amt;
  const over      = newSpent > budgetCat.budget;

  return (
    <div className="absolute inset-0 z-30 flex flex-col" style={{ backgroundColor: P.bgL }}>
      <FlowHeader step={step} total={totalSteps} onBack={back} onClose={onClose} />
      <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden px-5 pb-8">

        {/* STEP 1: Shared vs Personal */}
        {step === 1 && (
          <>
            <h2 className="text-xl font-bold mb-1 mt-2" style={{ fontFamily: "Fraunces, serif", color: P.text }}>¿Este gasto es…?</h2>
            <p className="text-xs mb-5" style={{ color: P.muted }}>Elige cómo se registrará en el Nido.</p>
            <div className="grid grid-cols-2 gap-3 mb-8">
              {[
                { val: true,  emoji: "🏠", label: "Compartido",  sub: "Todos participan"         },
                { val: false, emoji: "👤", label: "Personal",    sub: "Solo afecta mis finanzas"  },
              ].map(o => (
                <button key={String(o.val)} onClick={() => setShared(o.val)}
                  className="flex flex-col items-center gap-2 py-7 rounded-3xl border-2 transition-all"
                  style={{ borderColor: shared === o.val ? P.brnDk : "transparent", backgroundColor: shared === o.val ? P.sagePl : P.sub }}>
                  <span className="text-4xl">{o.emoji}</span>
                  <p className="text-sm font-bold" style={{ color: P.text }}>{o.label}</p>
                  <p className="text-[10px] text-center px-3 leading-relaxed" style={{ color: P.muted }}>{o.sub}</p>
                </button>
              ))}
            </div>
            <PBtn label="Continuar" onClick={next} disabled={shared === null} />
          </>
        )}

        {/* STEP 2: Category (shared only) */}
        {step === 2 && (
          <>
            <h2 className="text-xl font-bold mb-1 mt-2" style={{ fontFamily: "Fraunces, serif", color: P.text }}>¿A qué categoría pertenece?</h2>
            <p className="text-xs mb-5" style={{ color: P.muted }}>La categoría más usada aparece primero.</p>
            <div className="grid grid-cols-4 gap-2 mb-6">
              {EXP_CATS.map(c => (
                <button key={c.name} onClick={() => setCat(c.name)}
                  className="flex flex-col items-center gap-1.5 py-3 rounded-2xl border-2 transition-all"
                  style={{ borderColor: cat === c.name ? P.brnDk : "transparent", backgroundColor: cat === c.name ? P.sagePl : P.sub }}>
                  <span className="text-xl">{c.icon}</span>
                  <span className="text-[9px] font-medium text-center leading-tight" style={{ color: P.text }}>{c.name}</span>
                </button>
              ))}
            </div>
            <PBtn label="Continuar" onClick={next} disabled={!cat} />
          </>
        )}

        {/* STEP 3: Amount & details */}
        {step === 3 && (
          <>
            <h2 className="text-xl font-bold mb-4 mt-2" style={{ fontFamily: "Fraunces, serif", color: P.text }}>Registrar gasto</h2>
            {/* Amount */}
            <div className="rounded-3xl p-5 mb-3 shadow-sm text-center" style={{ backgroundColor: P.card }}>
              <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: P.muted }}>Monto</p>
              <div className="flex items-center justify-center gap-1">
                <span className="text-3xl font-bold" style={{ color: P.muted, fontFamily: "Fraunces, serif" }}>$</span>
                <input
                  className="text-4xl font-bold bg-transparent outline-none text-center w-48"
                  style={{ fontFamily: "Fraunces, serif", color: P.text }}
                  type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0"
                />
              </div>
            </div>
            {/* Description */}
            <div className="rounded-2xl px-4 py-3 mb-3 shadow-sm" style={{ backgroundColor: P.card }}>
              <p className="text-[9px] font-semibold uppercase tracking-widest mb-1" style={{ color: P.muted }}>Descripción</p>
              <input className="w-full text-sm bg-transparent outline-none font-medium"
                style={{ color: P.text }} placeholder="¿En qué?" value={desc} onChange={e => setDesc(e.target.value)} />
            </div>
            {/* Frequency */}
            <div className="rounded-2xl px-4 py-3 mb-3 shadow-sm" style={{ backgroundColor: P.card }}>
              <p className="text-[9px] font-semibold uppercase tracking-widest mb-2" style={{ color: P.muted }}>Frecuencia</p>
              <div className="flex gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden pb-0.5">
                {FREQUENCIES.map(f => (
                  <button key={f} onClick={() => setFreq(f)}
                    className="flex-shrink-0 px-3 py-1.5 rounded-full text-[10px] font-semibold transition-all"
                    style={{ backgroundColor: freq === f ? P.brnDk : P.sub, color: freq === f ? "#fff" : P.text }}>
                    {f}
                  </button>
                ))}
              </div>
            </div>
            {/* Who paid */}
            {shared && (
              <div className="rounded-2xl px-4 py-3 mb-3 shadow-sm" style={{ backgroundColor: P.card }}>
                <p className="text-[9px] font-semibold uppercase tracking-widest mb-3" style={{ color: P.muted }}>¿Quién pagó?</p>
                <div className="flex gap-2">
                  {([{ id: "diana", label: "Diana", color: P.sage }, { id: "carlos", label: "Carlos", color: "#5A9E90" }, { id: "both", label: "Ambos", color: P.brn }] as const).map(m => (
                    <button key={m.id} onClick={() => setPaidBy(m.id)}
                      className="flex-1 flex items-center gap-2 p-2.5 rounded-xl border-2 transition-all"
                      style={{ borderColor: paidBy === m.id ? m.color : "transparent", backgroundColor: paidBy === m.id ? `${m.color}15` : P.sub }}>
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white" style={{ backgroundColor: m.color }}>
                        {m.label[0]}
                      </div>
                      <span className="text-[10px] font-semibold" style={{ color: P.text }}>{m.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {/* Receipt */}
            <button className="w-full flex items-center gap-3 rounded-2xl px-4 py-3 mb-6 shadow-sm" style={{ backgroundColor: P.card }}>
              <Camera size={16} style={{ color: P.muted }} />
              <span className="text-xs" style={{ color: P.muted }}>Adjuntar comprobante <span style={{ color: P.brn }}>(opcional)</span></span>
            </button>
            <PBtn label="Continuar" onClick={next} disabled={!amount} />
          </>
        )}

        {/* STEP 4: Split method (shared only) */}
        {step === 4 && shared && (
          <>
            <h2 className="text-xl font-bold mb-1 mt-2" style={{ fontFamily: "Fraunces, serif", color: P.text }}>¿Cómo repartir este gasto?</h2>
            <p className="text-xs mb-5" style={{ color: P.muted }}>Nido sugiere el método configurado para tu Nido.</p>
            <div className="space-y-2 mb-6">
              {([
                { id: "capacity" as const, label: "Según capacidad de aportación", sub: `Diana ${Math.round(D_CAP/T_CAP*100)}% · Carlos ${100-Math.round(D_CAP/T_CAP*100)}%`, rec: true },
                { id: "income"   as const, label: "Según ingresos",                sub: `Diana ${Math.round(D_INC/T_INC*100)}% · Carlos ${100-Math.round(D_INC/T_INC*100)}%`  },
                { id: "equal"    as const, label: "50 / 50",                        sub: "Partes iguales"   },
                { id: "custom"   as const, label: "Personalizado",                  sub: "Elige porcentajes" },
              ]).map(o => (
                <button key={o.id} onClick={() => setSplit(o.id)}
                  className="w-full flex items-center gap-3 p-4 rounded-2xl border-2 text-left transition-all"
                  style={{ borderColor: split === o.id ? P.brnDk : "transparent", backgroundColor: split === o.id ? P.sagePl : P.sub }}>
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center`}
                    style={{ borderColor: split === o.id ? P.brnDk : P.brn }}>
                    {split === o.id && <div className="w-2 h-2 rounded-full" style={{ backgroundColor: P.brnDk }} />}
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-semibold" style={{ color: P.text }}>{o.label}</p>
                    <p className="text-[9px]" style={{ color: P.muted }}>{o.sub}</p>
                  </div>
                  {"rec" in o && o.rec && (
                    <span className="text-[9px] font-bold rounded-full px-2 py-0.5" style={{ backgroundColor: P.brnDk, color: "#fff" }}>✦</span>
                  )}
                </button>
              ))}
            </div>
            <PBtn label="Continuar" onClick={next} />
          </>
        )}

        {/* STEP 5 (or 4 for personal): Confirmation */}
        {((shared && step === 5) || (!shared && step === 4)) && (
          <>
            <h2 className="text-xl font-bold mb-4 mt-2" style={{ fontFamily: "Fraunces, serif", color: P.text }}>Confirmación</h2>
            {/* Summary card */}
            <div className="rounded-3xl p-5 mb-3 shadow-sm" style={{ backgroundColor: P.card }}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm font-bold" style={{ color: P.text }}>{desc || "Gasto"}</p>
                  <p className="text-[10px]" style={{ color: P.muted }}>Pagó {paidBy === "diana" ? "Diana" : paidBy === "carlos" ? "Carlos" : "Ambos"}</p>
                </div>
                <p className="text-2xl font-bold" style={{ fontFamily: "Fraunces, serif", color: P.text }}>{$k(amt)}</p>
              </div>
              {shared && (
                <>
                  <p className="text-[9px] font-semibold uppercase tracking-widest mb-2" style={{ color: P.muted }}>Se dividirá así</p>
                  <div className="flex gap-3 mb-3">
                    {[{ name: "Diana", amt: dianaAmt, color: P.sage }, { name: "Carlos", amt: carlosAmt, color: "#5A9E90" }].map(m => (
                      <div key={m.name} className="flex-1 rounded-2xl p-3 text-center" style={{ backgroundColor: P.sub }}>
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold mx-auto mb-1.5" style={{ backgroundColor: m.color }}>{m.name[0]}</div>
                        <p className="text-xs font-semibold" style={{ color: P.text }}>{m.name}</p>
                        <p className="text-sm font-bold" style={{ fontFamily: "Fraunces, serif", color: P.text }}>{$k(m.amt)}</p>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {/* Budget impact */}
              <p className="text-[9px] font-semibold uppercase tracking-widest mb-2" style={{ color: P.muted }}>
                {shared ? `Presupuesto de ${cat || "Despensa"}` : "Impacto en tu capacidad"}
              </p>
              {shared ? (
                <>
                  <div className="h-2 rounded-full overflow-hidden mb-1" style={{ backgroundColor: P.sub }}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, pct(newSpent, budgetCat.budget))}%`, backgroundColor: over ? P.danger : P.sage }} />
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span style={{ color: P.muted }}>{$k(newSpent)} de {$k(budgetCat.budget)}</span>
                    {over && <span className="font-semibold" style={{ color: P.warn }}>⚠️ +{$k(newSpent - budgetCat.budget)} sobre plan</span>}
                  </div>
                </>
              ) : (
                <div className="rounded-2xl p-3" style={{ backgroundColor: P.sub }}>
                  <p className="text-xs font-semibold" style={{ color: P.text }}>Tu nueva capacidad de aportación</p>
                  <p className="text-xl font-bold" style={{ fontFamily: "Fraunces, serif", color: P.sage }}>{$k(D_CAP - amt)}</p>
                  <p className="text-[10px]" style={{ color: P.muted }}>−{$k(amt)} respecto a este mes</p>
                </div>
              )}
            </div>
            <PBtn label="Guardar gasto" onClick={save} />
          </>
        )}
      </div>
    </div>
  );
}

// ── GOAL FLOW ─────────────────────────────────────────────────────────────────
function GoalFlow({ onClose }: { onClose: () => void }) {
  const [step, setStep]         = useState(1);
  const [goalType, setGoalType] = useState("");
  const [goalEmoji, setGoalEmoji] = useState("✨");
  const [name, setName]         = useState("");
  const [target, setTarget]     = useState("180000");
  const [saveMethod, setSaveMethod] = useState(0);
  const [monthly, setMonthly]   = useState(8000);
  const [done, setDone]         = useState(false);

  const remaining = parseFloat(target) || 180000;
  const months    = Math.ceil(remaining / monthly);
  const estimatedDate = (() => {
    const d = new Date(); d.setMonth(d.getMonth() + months);
    return d.toLocaleDateString("es-MX", { month: "long", year: "numeric" });
  })();

  const back  = () => step > 1 ? setStep(s => s-1) : onClose();
  const TOTAL = 4;

  if (done) {
    return (
      <div className="absolute inset-0 z-30 flex flex-col items-center justify-center px-6 text-center" style={{ backgroundColor: P.bgL }}>
        <div className="text-6xl mb-4">🎉</div>
        <h2 className="text-2xl font-bold mb-2" style={{ fontFamily: "Fraunces, serif", color: P.text }}>¡Meta creada!</h2>
        <p className="text-sm mb-8 leading-relaxed" style={{ color: P.muted }}>
          Ahora aparece en tu dashboard.<br />Nido calculará automáticamente las aportaciones.
        </p>
        <div className="w-full rounded-3xl p-5 mb-8" style={{ backgroundColor: "#E8F4EF", border: `2px solid ${P.sageLt}` }}>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-3xl">{goalEmoji}</span>
            <div>
              <p className="text-sm font-bold" style={{ color: P.text }}>{name || "Nueva meta"}</p>
              <p className="text-[10px]" style={{ color: P.muted }}>Diana & Carlos · {$k(monthly)}/mes</p>
            </div>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: P.sageLt }}>
            <div className="h-full w-0 rounded-full" style={{ backgroundColor: P.sage }} />
          </div>
          <div className="flex justify-between mt-1 text-[10px]" style={{ color: P.muted }}>
            <span>$0 de {$k(remaining)}</span><span>{estimatedDate}</span>
          </div>
        </div>
        <button onClick={onClose}
          className="w-full py-4 rounded-2xl font-semibold text-sm"
          style={{ backgroundColor: P.brnDk, color: "#fff" }}>
          Ver en el dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 z-30 flex flex-col" style={{ backgroundColor: P.bgL }}>
      <FlowHeader step={step} total={TOTAL} onBack={back} onClose={onClose} />
      <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden px-5 pb-8">

        {/* STEP 1: Goal type */}
        {step === 1 && (
          <>
            <h2 className="text-xl font-bold mb-1 mt-2" style={{ fontFamily: "Fraunces, serif", color: P.text }}>¿Qué quieren lograr?</h2>
            <p className="text-xs mb-5" style={{ color: P.muted }}>Elige un tipo de meta para empezar.</p>
            <div className="grid grid-cols-4 gap-2 mb-6">
              {GOAL_TYPES.map(g => (
                <button key={g.name} onClick={() => { setGoalType(g.name); setGoalEmoji(g.emoji); }}
                  className="flex flex-col items-center gap-1.5 py-3 rounded-2xl border-2 transition-all"
                  style={{ borderColor: goalType === g.name ? P.brnDk : "transparent", backgroundColor: goalType === g.name ? P.sagePl : P.sub }}>
                  <span className="text-2xl">{g.emoji}</span>
                  <span className="text-[9px] font-medium text-center leading-tight" style={{ color: P.text }}>{g.name}</span>
                </button>
              ))}
            </div>
            <PBtn label="Continuar" onClick={() => setStep(2)} disabled={!goalType} />
          </>
        )}

        {/* STEP 2: Info */}
        {step === 2 && (
          <>
            <h2 className="text-xl font-bold mb-4 mt-2" style={{ fontFamily: "Fraunces, serif", color: P.text }}>Información</h2>
            <div className="rounded-2xl px-4 py-3 mb-3 shadow-sm" style={{ backgroundColor: P.card }}>
              <p className="text-[9px] font-semibold uppercase tracking-widest mb-1" style={{ color: P.muted }}>Nombre de la meta</p>
              <input className="w-full text-sm font-semibold bg-transparent outline-none"
                style={{ color: P.text }} placeholder="Viaje a Japón"
                value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="rounded-2xl px-4 py-3 mb-3 shadow-sm" style={{ backgroundColor: P.card }}>
              <p className="text-[9px] font-semibold uppercase tracking-widest mb-1" style={{ color: P.muted }}>Monto objetivo</p>
              <div className="flex items-center gap-1">
                <span className="text-base font-bold" style={{ color: P.muted }}>$</span>
                <input className="flex-1 text-xl font-bold bg-transparent outline-none"
                  style={{ fontFamily: "Fraunces, serif", color: P.text }} type="number"
                  value={target} onChange={e => setTarget(e.target.value)} placeholder="180,000" />
              </div>
            </div>
            <div className="rounded-2xl px-4 py-3 mb-6 shadow-sm flex items-center gap-3" style={{ backgroundColor: P.card }}>
              <Camera size={16} style={{ color: P.muted }} />
              <span className="text-xs" style={{ color: P.muted }}>Agregar foto <span style={{ color: P.brn }}>(opcional)</span></span>
            </div>
            <PBtn label="Continuar" onClick={() => setStep(3)} />
          </>
        )}

        {/* STEP 3: Save method */}
        {step === 3 && (
          <>
            <h2 className="text-xl font-bold mb-1 mt-2" style={{ fontFamily: "Fraunces, serif", color: P.text }}>¿Cómo quieren ahorrar?</h2>
            <p className="text-xs mb-5" style={{ color: P.muted }}>Pueden cambiarlo después.</p>
            <div className="space-y-2 mb-6">
              {SAVE_METHODS.map((m, i) => (
                <button key={i} onClick={() => setSaveMethod(i)}
                  className="w-full flex items-center gap-3 p-4 rounded-2xl border-2 text-left transition-all"
                  style={{ borderColor: saveMethod === i ? P.brnDk : "transparent", backgroundColor: saveMethod === i ? P.sagePl : P.sub }}>
                  <span className="text-xl w-8 text-center">{m.icon}</span>
                  <span className="text-xs font-semibold" style={{ color: P.text }}>{m.label}</span>
                  <div className="ml-auto w-4 h-4 rounded-full border-2 flex items-center justify-center"
                    style={{ borderColor: saveMethod === i ? P.brnDk : P.brn }}>
                    {saveMethod === i && <div className="w-2 h-2 rounded-full" style={{ backgroundColor: P.brnDk }} />}
                  </div>
                </button>
              ))}
            </div>
            <PBtn label="Continuar" onClick={() => setStep(4)} />
          </>
        )}

        {/* STEP 4: Simulation */}
        {step === 4 && (
          <>
            <h2 className="text-xl font-bold mb-1 mt-2" style={{ fontFamily: "Fraunces, serif", color: P.text }}>Simulación</h2>
            <p className="text-xs mb-5" style={{ color: P.muted }}>Ajusta la aportación mensual y ve cuándo llegarán.</p>
            <div className="rounded-3xl p-5 mb-4 shadow-sm" style={{ backgroundColor: P.card }}>
              <div className="flex justify-between items-center mb-4">
                <div>
                  <p className="text-xs font-semibold" style={{ color: P.text }}>{name || "Tu meta"}</p>
                  <p className="text-[10px]" style={{ color: P.muted }}>{goalEmoji} Meta: {$k(remaining)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px]" style={{ color: P.muted }}>Llegarán en</p>
                  <p className="text-xl font-bold" style={{ fontFamily: "Fraunces, serif", color: P.brnDk }}>{months} meses</p>
                </div>
              </div>
              {/* Slider */}
              <p className="text-[9px] font-semibold uppercase tracking-widest mb-2" style={{ color: P.muted }}>
                Aportación mensual: {$k(monthly)}
              </p>
              <input type="range" min={1000} max={20000} step={500} value={monthly}
                onChange={e => setMonthly(Number(e.target.value))}
                className="w-full h-2 rounded-full appearance-none cursor-pointer mb-2"
                style={{ accentColor: P.brnDk }} />
              <div className="flex justify-between text-[9px]" style={{ color: P.muted }}>
                <span>$1k</span><span>$20k</span>
              </div>
            </div>
            <PBtn label="Crear esta meta" onClick={() => setDone(true)} />
          </>
        )}
      </div>
    </div>
  );
}

// ── CONTRIBUTION FLOW ─────────────────────────────────────────────────────────
function ContribFlow({ onClose }: { onClose: () => void }) {
  const [step, setStep]       = useState(1);
  const [goalIdx, setGoalIdx] = useState(-1);
  const [amount, setAmount]   = useState("");
  const [who, setWho]         = useState<"diana"|"carlos"|"both">("both");

  const goal = GOALS[goalIdx];
  const amt  = parseFloat(amount) || 0;
  const newCurrent = goal ? goal.current + amt : 0;

  return (
    <div className="absolute inset-0 z-30 flex flex-col" style={{ backgroundColor: P.bgL }}>
      <FlowHeader step={step} total={3} onBack={() => step > 1 ? setStep(s => s-1) : onClose()} onClose={onClose} />
      <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden px-5 pb-8">

        {step === 1 && (
          <>
            <h2 className="text-xl font-bold mb-1 mt-2" style={{ fontFamily: "Fraunces, serif", color: P.text }}>¿A qué meta aportarás?</h2>
            <p className="text-xs mb-5" style={{ color: P.muted }}>Elige la meta que quieres avanzar.</p>
            <div className="space-y-2 mb-6">
              {GOALS.map((g, i) => (
                <button key={g.name} onClick={() => setGoalIdx(i)}
                  className="w-full flex items-center gap-3 p-4 rounded-2xl border-2 text-left transition-all"
                  style={{ borderColor: goalIdx === i ? P.brnDk : "transparent", backgroundColor: goalIdx === i ? g.bg : P.sub }}>
                  <span className="text-2xl">{g.emoji}</span>
                  <div className="flex-1">
                    <p className="text-xs font-semibold" style={{ color: P.text }}>{g.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ backgroundColor: P.sub }}>
                        <div className="h-full rounded-full" style={{ width: `${pct(g.current, g.target)}%`, backgroundColor: g.color }} />
                      </div>
                      <span className="text-[9px]" style={{ color: P.muted }}>{pct(g.current, g.target)}%</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
            <PBtn label="Continuar" onClick={() => setStep(2)} disabled={goalIdx < 0} />
          </>
        )}

        {step === 2 && goal && (
          <>
            <h2 className="text-xl font-bold mb-4 mt-2" style={{ fontFamily: "Fraunces, serif", color: P.text }}>¿Cuánto aportan?</h2>
            <div className="rounded-3xl p-5 mb-3 shadow-sm text-center" style={{ backgroundColor: P.card }}>
              <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: P.muted }}>Monto</p>
              <div className="flex items-center justify-center gap-1">
                <span className="text-3xl font-bold" style={{ color: P.muted, fontFamily: "Fraunces, serif" }}>$</span>
                <input className="text-4xl font-bold bg-transparent outline-none text-center w-40"
                  style={{ fontFamily: "Fraunces, serif", color: P.text }}
                  type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" />
              </div>
            </div>
            <div className="rounded-2xl px-4 py-3 mb-6 shadow-sm" style={{ backgroundColor: P.card }}>
              <p className="text-[9px] font-semibold uppercase tracking-widest mb-3" style={{ color: P.muted }}>¿Quién aporta?</p>
              <div className="flex gap-2">
                {([{ id: "diana" as const, l: "Diana", c: P.sage }, { id: "carlos" as const, l: "Carlos", c: "#5A9E90" }, { id: "both" as const, l: "Ambos", c: P.brn }]).map(m => (
                  <button key={m.id} onClick={() => setWho(m.id)}
                    className="flex-1 flex flex-col items-center gap-1 py-3 rounded-xl border-2 transition-all"
                    style={{ borderColor: who === m.id ? m.c : "transparent", backgroundColor: who === m.id ? `${m.c}15` : P.sub }}>
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold" style={{ backgroundColor: m.c }}>{m.l[0]}</div>
                    <span className="text-[10px] font-semibold" style={{ color: P.text }}>{m.l}</span>
                  </button>
                ))}
              </div>
            </div>
            <PBtn label="Continuar" onClick={() => setStep(3)} disabled={!amount} />
          </>
        )}

        {step === 3 && goal && (
          <>
            <h2 className="text-xl font-bold mb-4 mt-2" style={{ fontFamily: "Fraunces, serif", color: P.text }}>Confirmación</h2>
            <div className="rounded-3xl p-5 mb-3 shadow-sm" style={{ backgroundColor: P.card }}>
              <div className="flex items-center gap-3 mb-4">
                <span className="text-3xl">{goal.emoji}</span>
                <div className="flex-1">
                  <p className="text-sm font-bold" style={{ color: P.text }}>{goal.name}</p>
                  <p className="text-[10px]" style={{ color: P.muted }}>Aporta {who === "diana" ? "Diana" : who === "carlos" ? "Carlos" : "Diana & Carlos"}</p>
                </div>
                <p className="text-xl font-bold" style={{ fontFamily: "Fraunces, serif", color: P.brnDk }}>+{$k(amt)}</p>
              </div>
              <div className="h-2 rounded-full overflow-hidden mb-2" style={{ backgroundColor: P.sub }}>
                <div className="h-full rounded-full" style={{ width: `${pct(newCurrent, goal.target)}%`, backgroundColor: goal.color }} />
              </div>
              <div className="flex justify-between text-[10px]" style={{ color: P.muted }}>
                <span>{$k(newCurrent)} de {$k(goal.target)}</span>
                <span>{pct(newCurrent, goal.target)}%</span>
              </div>
            </div>
            <PBtn label="Guardar aportación" onClick={onClose} />
          </>
        )}
      </div>
    </div>
  );
}

// ── HEALTH GAUGE ──────────────────────────────────────────────────────────────
function HealthGauge({ score }: { score: number }) {
  const data = [{ v: score }, { v: 100 - score }];
  return (
    <div className="relative w-28" style={{ height: 56 }}>
      <ResponsiveContainer width="100%" height={56}>
        <PieChart>
          <Pie data={data} dataKey="v" cx="50%" cy="100%" startAngle={180} endAngle={0}
            innerRadius={40} outerRadius={52} strokeWidth={0}>
            <Cell fill={P.sageLt} />
            <Cell fill="rgba(255,255,255,0.15)" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-x-0 flex justify-center" style={{ bottom: 6 }}>
        <span className="text-2xl font-bold text-white leading-none" style={{ fontFamily: "Fraunces, serif" }}>{score}</span>
      </div>
    </div>
  );
}

// ── HOME SCREEN ───────────────────────────────────────────────────────────────
function HomeScreen({ onProfileOpen, onNavigate }: { onProfileOpen: () => void; onNavigate: (tab: Tab) => void }) {
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

// ── BUDGET SCREEN ─────────────────────────────────────────────────────────────
function BudgetScreen() {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="h-full overflow-y-auto [&::-webkit-scrollbar]:hidden">
      <div className="px-6 pt-3 pb-1">
        <h2 className="text-[22px] font-bold" style={{ fontFamily: "Fraunces, serif", color: P.text }}>Presupuesto</h2>
        <p className="text-xs" style={{ color: P.muted }}>Junio 2026</p>
      </div>
      <div className="mx-6 my-3 rounded-[1.5rem] p-5 shadow-sm" style={{ backgroundColor: P.card }}>
        <div className="flex items-end justify-between mb-4">
          <div>
            <p className="text-[10px] mb-0.5" style={{ color: P.muted }}>Total gastado</p>
            <p className="text-[26px] font-bold" style={{ fontFamily: "Fraunces, serif", color: P.text }}>{$k(TOT_S)}</p>
            <p className="text-[10px] font-semibold mt-0.5" style={{ color: P.danger }}>+$1,837 sobre presupuesto</p>
          </div>
          <div className="text-right">
            <p className="text-[10px]" style={{ color: P.muted }}>Presupuestado</p>
            <p className="text-lg font-bold" style={{ color: P.text }}>{$k(TOT_B)}</p>
          </div>
        </div>
        <div className="h-2.5 flex rounded-full overflow-hidden gap-px">
          {CATS.map(c => <div key={c.name} style={{ flex: c.budget, backgroundColor: c.color, opacity: 0.8 }} />)}
        </div>
        <div className="flex gap-3 mt-3 flex-wrap">
          {CATS.slice(0, 4).map(c => (
            <div key={c.name} className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c.color }} />
              <span className="text-[9px]" style={{ color: P.muted }}>{c.icon} {c.name}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="px-6 space-y-2 pb-6">
        {CATS.map(cat => {
          const over = cat.spent > cat.budget;
          const ratio = pct(cat.spent, cat.budget);
          const isOpen = open === cat.name;
          return (
            <button key={cat.name} onClick={() => setOpen(isOpen ? null : cat.name)}
              className="w-full rounded-2xl p-4 shadow-sm text-left active:scale-[0.99] transition-transform" style={{ backgroundColor: P.card }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0" style={{ backgroundColor: P.sub }}>{cat.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold" style={{ color: P.text }}>{cat.name}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold" style={{ color: over ? P.danger : P.text }}>{$k(cat.spent)}</span>
                      <span className="text-[9px]" style={{ color: P.muted }}>/ {$k(cat.budget)}</span>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: P.sub }}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, ratio)}%`, backgroundColor: over ? P.danger : cat.color }} />
                  </div>
                </div>
              </div>
              {isOpen && (
                <div className="mt-3 pt-3 border-t grid grid-cols-3 gap-2" style={{ borderColor: P.sub }}>
                  {[
                    { label: "Gastado",    value: $k(cat.spent), color: P.text  },
                    { label: "Restante",   value: over ? `−${$k(cat.spent-cat.budget)}` : $k(cat.budget-cat.spent), color: over ? P.danger : P.sageDk },
                    { label: "vs mes ant.",value: "+12%",         color: P.warn  },
                  ].map(s => (
                    <div key={s.label} className="text-center">
                      <p className="text-[9px] mb-0.5" style={{ color: P.muted }}>{s.label}</p>
                      <p className="text-xs font-bold" style={{ color: s.color }}>{s.value}</p>
                    </div>
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── GOALS SCREEN ──────────────────────────────────────────────────────────────
function GoalsScreen() {
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

// ── HOUSEHOLD SCREEN ──────────────────────────────────────────────────────────
function HouseholdScreen({ model, setModel }: { model: Model; setModel: (m: Model) => void }) {
  const [showItems, setShowItems]   = useState(false);
  const [events, setEvents]         = useState(LIFE_EVENTS.map(e => e.active));
  const shares = model === "equal" ? { d: 50, c: 50 }
    : model === "proportional" ? { d: Math.round(D_INC/T_INC*100), c: Math.round(C_INC/T_INC*100) }
    : { d: Math.round(D_CAP/T_CAP*100), c: Math.round(C_CAP/T_CAP*100) };

  return (
    <div className="h-full overflow-y-auto [&::-webkit-scrollbar]:hidden">
      <div className="px-6 pt-3 pb-1">
        <h2 className="text-[22px] font-bold" style={{ fontFamily: "Fraunces, serif", color: P.text }}>Hogar</h2>
        <p className="text-xs" style={{ color: P.muted }}>Departamento · 2 miembros</p>
      </div>
      <div className="px-6 my-3 flex gap-3">
        {[
          { name: "Diana",  init: "DV", income: D_INC, personal: D_PER, cap: D_CAP, color: P.sage  },
          { name: "Carlos", init: "CR", income: C_INC, personal: C_PER, cap: C_CAP, color: "#5A9E90" },
        ].map(m => (
          <div key={m.name} className="flex-1 rounded-[1.5rem] p-4 shadow-sm" style={{ backgroundColor: P.card }}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: m.color }}>{m.init}</div>
              <span className="text-sm font-semibold" style={{ color: P.text }}>{m.name}</span>
            </div>
            <p className="text-[9px]" style={{ color: P.muted }}>Ingreso</p>
            <p className="text-base font-bold" style={{ fontFamily: "Fraunces, serif", color: P.text }}>{$k(m.income)}</p>
            <div className="mt-2 pt-2 border-t" style={{ borderColor: P.sub }}>
              <p className="text-[9px]" style={{ color: P.muted }}>Gastos pers.</p>
              <p className="text-xs font-semibold" style={{ color: P.danger }}>−{$k(m.personal)}</p>
              <p className="text-[9px] mt-1" style={{ color: P.muted }}>Capacidad</p>
              <p className="text-sm font-bold" style={{ color: m.color }}>{$k(m.cap)}</p>
            </div>
          </div>
        ))}
      </div>
      {/* Diana items expandable */}
      <div className="mx-6 mb-3 bg-white rounded-[1.5rem] shadow-sm overflow-hidden">
        <button className="w-full flex items-center justify-between p-4" onClick={() => setShowItems(!showItems)}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm" style={{ backgroundColor: P.sagePl }}>👤</div>
            <div className="text-left">
              <p className="text-xs font-semibold" style={{ color: P.text }}>Gastos fijos de Diana</p>
              <p className="text-[9px]" style={{ color: P.muted }}>{DIANA_ITEMS.length} compromisos · {$k(D_PER)}/mes</p>
            </div>
          </div>
          <span className="text-[10px] font-bold" style={{ color: P.danger }}>−{$k(D_PER)}</span>
        </button>
        {showItems && (
          <div className="px-4 pb-4 space-y-1.5 border-t pt-3" style={{ borderColor: P.sub }}>
            {DIANA_ITEMS.map(item => (
              <div key={item.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2"><span className="text-sm">{item.icon}</span><span className="text-xs" style={{ color: P.text }}>{item.name}</span></div>
                <span className="text-[10px] font-semibold" style={{ color: P.muted }}>{$k(item.amount)}/mes</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {/* Contribution model */}
      <div className="mx-6 mb-3 bg-white rounded-[1.5rem] p-5 shadow-sm">
        <h3 className="text-xs font-semibold mb-3" style={{ color: P.text }}>Modelo de aportación</h3>
        <div className="space-y-2 mb-5">
          {([
            { id: "equal" as Model,       label: "Por partes iguales",     sub: "50 / 50" },
            { id: "proportional" as Model,label: "Proporcional al ingreso", sub: `${Math.round(D_INC/T_INC*100)}% / ${Math.round(C_INC/T_INC*100)}%` },
            { id: "capacity" as Model,    label: "Capacidad de aportación",sub: "Recomendado", rec: true },
          ] as const).map(opt => (
            <button key={opt.id} onClick={() => setModel(opt.id)}
              className="w-full flex items-center justify-between p-3 rounded-2xl border-2 text-left transition-all"
              style={{ borderColor: model === opt.id ? P.brnDk : "transparent", backgroundColor: model === opt.id ? P.sagePl : P.sub }}>
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-full border-2 flex items-center justify-center"
                  style={{ borderColor: model === opt.id ? P.brnDk : P.brn }}>
                  {model === opt.id && <div className="w-2 h-2 rounded-full" style={{ backgroundColor: P.brnDk }} />}
                </div>
                <div>
                  <p className="text-xs font-semibold" style={{ color: P.text }}>{opt.label}</p>
                  <p className="text-[9px]" style={{ color: P.muted }}>{opt.sub}</p>
                </div>
              </div>
              {"rec" in opt && opt.rec && (
                <span className="text-[9px] font-bold rounded-full px-2 py-0.5" style={{ backgroundColor: P.brnDk, color: "#fff" }}>✦ IDEAL</span>
              )}
            </button>
          ))}
        </div>
        <h3 className="text-[9px] font-semibold uppercase tracking-wider mb-3" style={{ color: P.muted }}>Aportación mensual · {$k(TOT_B)}/mes</h3>
        {[{ name: "Diana", share: shares.d, color: P.sage }, { name: "Carlos", share: shares.c, color: "#5A9E90" }].map(m => (
          <div key={m.name} className="mb-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium" style={{ color: P.text }}>{m.name}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold" style={{ color: P.text }}>{$k(Math.round(m.share/100*TOT_B))}</span>
                <span className="text-[9px] w-7 text-right" style={{ color: P.muted }}>{m.share}%</span>
              </div>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: P.sub }}>
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${m.share}%`, backgroundColor: m.color }} />
            </div>
          </div>
        ))}
        {model === "capacity" && (
          <div className="mt-3 rounded-2xl p-3 border" style={{ backgroundColor: "#E8F4EF", borderColor: `${P.sageLt}60` }}>
            <p className="text-[10px] font-semibold mb-1" style={{ color: P.sageDk }}>¿Por qué es más justo?</p>
            <p className="text-[10px] leading-relaxed" style={{ color: P.text }}>Calcula cuánto puede aportar cada persona <em>después</em> de cubrir sus compromisos personales fijos.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── ACTIVITY SCREEN ───────────────────────────────────────────────────────────
function ActivityScreen() {
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

// ── ONBOARDING ────────────────────────────────────────────────────────────────
const NEST_TYPES = [
  { emoji: "🏠", label: "Pareja"       }, { emoji: "🏡", label: "Familia"      },
  { emoji: "🛋️", label: "Roommates"    }, { emoji: "✈️", label: "Viaje"        },
  { emoji: "🎉", label: "Evento"       }, { emoji: "💼", label: "Negocio"      },
  { emoji: "👨‍👩‍👧", label: "Con hijos"  }, { emoji: "✨", label: "Personalizado" },
];
const EXP_SUGG = [
  { name: "Renta",              icon: "🏢", selected: false, amount: "", type: "shared"   as const },
  { name: "Supermercado",       icon: "🛒", selected: false, amount: "", type: "shared"   as const },
  { name: "Restaurantes",       icon: "🍔", selected: false, amount: "", type: "shared"   as const },
  { name: "Gasolina",           icon: "⛽", selected: false, amount: "", type: "personal" as const },
  { name: "Internet",           icon: "📡", selected: false, amount: "", type: "shared"   as const },
  { name: "Pago auto",          icon: "🚗", selected: false, amount: "", type: "personal" as const },
  { name: "Tarjeta de crédito", icon: "💳", selected: false, amount: "", type: "personal" as const },
  { name: "Suscripciones",      icon: "📱", selected: false, amount: "", type: "personal" as const },
  { name: "Limpieza",           icon: "🧹", selected: false, amount: "", type: "shared"   as const },
  { name: "Mascotas",           icon: "🐾", selected: false, amount: "", type: "shared"   as const },
  { name: "Luz",                icon: "💡", selected: false, amount: "", type: "shared"   as const },
  { name: "Gas",                icon: "🔥", selected: false, amount: "", type: "shared"   as const },
  { name: "Agua",               icon: "💧", selected: false, amount: "", type: "shared"   as const },
  { name: "Casetas",            icon: "🛣️", selected: false, amount: "", type: "shared"   as const },
  { name: "Seguro médico",      icon: "🏥", selected: false, amount: "", type: "personal" as const },
  { name: "Retiro",             icon: "📈", selected: false, amount: "", type: "personal" as const },
  { name: "Terapia",            icon: "💆", selected: false, amount: "", type: "personal" as const },
  { name: "Gym",                icon: "🏋️", selected: false, amount: "", type: "personal" as const },
];

interface OData {
  flow: "join"|"create"|null; nestType: string; nestEmoji: string; nestName: string;
  userName: string; salary: string; freelance: string; savings: string;
  savingsType: "personal" | "shared" | "both";
  savingsShared: string;
  expenses: typeof EXP_SUGG; contrib: Model;
  _showAdd?: boolean; _emoji?: string; _cname?: string; _etype?: "personal"|"shared";
}
// ── EXPENSE ENTRY MODAL (onboarding) ─────────────────────────────────────────
function ExpenseEntryModal({
  exp, onConfirm, onClose,
}: {
  exp: typeof EXP_SUGG[0];
  onConfirm: (amount: string, type: "personal" | "shared") => void;
  onClose: () => void;
}) {
  const [digits, setDigits] = useState(exp.amount || "");
  const [type, setType]     = useState<"personal" | "shared">(exp.type);

  const quickAmounts = QUICK_AMOUNTS[exp.name] ?? DEFAULT_QUICK;

  const numVal  = parseInt(digits) || 0;
  const display = numVal > 0 ? numVal.toLocaleString("es-MX") : "0";

  const tap = (k: string) => {
    if (k === "⌫") { setDigits(d => d.slice(0, -1)); return; }
    if (digits.length >= 7) return;
    setDigits(d => (d === "0" ? k : d + k));
  };

  const canConfirm = numVal > 0;

  return (
    <div className="absolute inset-0 z-50 flex flex-col" style={{ backgroundColor: "#FFFFFF" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-6 pb-2 flex-shrink-0">
        <div className="w-9 h-9" />
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-2xl">{exp.icon}</span>
          <p className="text-xs font-semibold" style={{ color: P.muted }}>{exp.name}</p>
        </div>
        <button onClick={onClose} className="w-9 h-9 rounded-full flex items-center justify-center border-2" style={{ backgroundColor: "#FFFFFF", borderColor: P.brnDk }}>
          <X size={16} style={{ color: P.brnDk }} />
        </button>
      </div>

      {/* Amount */}
      <div className="flex flex-col items-center px-6 pt-4 pb-2 flex-shrink-0">
        <p className="text-6xl font-bold mb-5" style={{ fontFamily: "Fraunces, serif", color: P.text }}>
          ${display}
        </p>

        {/* Type toggle */}
        <div className="flex gap-2 mb-5">
          {([{ val: "personal" as const, label: "Personal", emoji: "👤" }, { val: "shared" as const, label: "Compartido", emoji: "🏠" }]).map(t => (
            <button key={t.val} onClick={() => setType(t.val)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold border-2 transition-all"
              style={{ backgroundColor: "#FFFFFF", borderColor: type === t.val ? P.brnDk : "rgba(47,42,40,0.15)", color: type === t.val ? P.brnDk : P.muted }}>
              <span>{t.emoji}</span>{t.label}
            </button>
          ))}
        </div>

        {/* Quick amounts */}
        <div className="flex gap-2 w-full mb-5">
          {quickAmounts.map(v => {
            const s = String(v);
            const label = v >= 1000 ? `$${v / 1000}k` : `$${v}`;
            return (
              <button key={v} onClick={() => setDigits(s)}
                className="flex-1 py-2.5 rounded-2xl text-xs font-bold border-2 transition-all"
                style={{ borderColor: digits === s ? P.brnDk : "rgba(47,42,40,0.15)", backgroundColor: "#FFFFFF", color: P.text }}>
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Numpad */}
      <div className="flex-1 px-6">
        <div className="grid grid-cols-3 gap-2">
          {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((k, i) => (
            <button key={i} onClick={() => k && tap(k)} disabled={!k}
              className="h-14 rounded-2xl flex items-center justify-center text-xl font-semibold transition-all active:scale-95"
              style={{
                backgroundColor: k === "⌫" ? P.warnBg : k === "" ? "transparent" : P.sub,
                color: k === "⌫" ? P.warn : P.text,
                cursor: k ? "pointer" : "default",
              }}>
              {k === "⌫" ? "⌫" : k}
            </button>
          ))}
        </div>
      </div>

      {/* Confirm */}
      <div className="px-6 pb-8 pt-4 flex-shrink-0">
        <button onClick={() => canConfirm && onConfirm(String(numVal), type)}
          className="w-full py-4 rounded-2xl font-semibold text-sm transition-all active:scale-[0.98]"
          style={{ backgroundColor: canConfirm ? P.brnDk : P.sub, color: canConfirm ? "#fff" : P.muted }}>
          Agregar gasto
        </button>
      </div>
    </div>
  );
}

function OProgress2({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex gap-1.5 mb-6">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className="h-1 flex-1 rounded-full transition-all" style={{ backgroundColor: i < step ? P.brnDk : P.sub }} />
      ))}
    </div>
  );
}
function OBtn2({ label, onClick, variant = "primary", disabled = false }: { label: string; onClick: () => void; variant?: "primary"|"secondary"; disabled?: boolean }) {
  return (
    <button onClick={disabled ? undefined : onClick} className="w-full py-4 rounded-2xl font-semibold text-sm transition-all active:scale-[0.98]"
      style={variant === "primary"
        ? { backgroundColor: disabled ? P.sub : P.brnDk, color: disabled ? P.muted : "#fff", cursor: disabled ? "not-allowed" : "pointer" }
        : { backgroundColor: P.sub, color: P.text }}>
      {label}
    </button>
  );
}

function OnboardingFlow({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState<OStep>("welcome");
  const [data, setData] = useState<OData>({
    flow: null, nestType: "", nestEmoji: "🏠", nestName: "",
    userName: "", salary: "", freelance: "", savings: "",
    savingsType: "personal", savingsShared: "",
    expenses: EXP_SUGG.map(e => ({ ...e })), contrib: "capacity",
  });
  const [joinCode, setJoinCode] = useState("");
  const [expEditIdx, setExpEditIdx] = useState<number | null>(null);
  const set = (k: keyof OData, v: OData[keyof OData]) => setData(p => ({ ...p, [k]: v }));
  const PERSONAL: OStep[] = ["p-name","p-income","p-savings","p-expenses","p-contrib"];
  const pIdx = PERSONAL.indexOf(step);
  const isPers = pIdx >= 0;

  const expCanContinue = data.expenses.some(e => e.selected);

  const handleExpConfirm = (amount: string, type: "personal" | "shared") => {
    if (expEditIdx === null) return;
    setData(p => {
      const expenses = [...p.expenses];
      expenses[expEditIdx] = { ...expenses[expEditIdx], selected: true, amount, type };
      return { ...p, expenses };
    });
    setExpEditIdx(null);
  };

  return (
    <div className="relative min-h-screen flex flex-col overflow-hidden" style={{ backgroundColor: P.bgL, fontFamily: "Figtree, sans-serif" }}>
        <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden px-6 pt-4 pb-8">

          {step === "welcome" && (
            <div className="flex flex-col h-full">
              <div className="flex-1 flex flex-col items-center justify-center">
                <NidoHouse />
                <div className="text-center mt-2 mb-8">
                  <h1 className="text-4xl font-bold mb-2" style={{ fontFamily: "Fraunces, serif", color: P.text }}>Nido</h1>
                  <p className="text-sm leading-relaxed" style={{ color: P.muted }}>El lugar donde las personas construyen<br />su patrimonio juntas.</p>
                </div>
              </div>
              <div className="space-y-3">
                <OBtn2 label="🪺 Crear un nuevo Nido" onClick={() => { set("flow","create"); setStep("auth"); }} />
                <OBtn2 label="👋 Unirme a un Nido"   onClick={() => { set("flow","join");   setStep("auth"); }} variant="secondary" />
                <p className="text-center text-[11px] leading-relaxed pt-1" style={{ color: P.muted }}>Puedes pertenecer a múltiples Nidos.<br />Ideal para parejas, roommates, familias y más.</p>
              </div>
            </div>
          )}

          {step === "auth" && (
            <div className="flex flex-col h-full">
              <button onClick={() => setStep("welcome")} className="flex items-center gap-1 mb-2" style={{ color: P.muted }}>
                <ChevronLeft size={16}/><span className="text-xs font-medium">Atrás</span>
              </button>
              <div className="flex-1 flex flex-col justify-center">
                {/* Brand */}
                <div className="text-center mb-8">
                  <p className="text-xs font-semibold mb-1" style={{ color: P.muted }}>
                    {data.flow === "create" ? "Crear un nuevo Nido" : "Unirme a un Nido"}
                  </p>
                  <h2 className="text-3xl font-bold" style={{ fontFamily: "Fraunces, serif", color: P.text }}>Bienvenido</h2>
                  <p className="text-xs mt-1.5" style={{ color: P.muted }}>Usa tu cuenta para continuar</p>
                </div>

                {/* Google button */}
                <button
                  onClick={() => {
                    setData(p => ({ ...p, userName: "Diana Valdés" }));
                    setStep(data.flow === "create" ? "c-name" : "join");
                  }}
                  className="w-full flex items-center justify-center gap-3 py-3.5 rounded-2xl border-2 mb-4 transition-all active:scale-[0.98] font-semibold text-sm"
                  style={{ backgroundColor: "#FFFFFF", borderColor: "rgba(47,42,40,0.15)", color: P.text }}>
                  {/* Google G */}
                  <svg width="20" height="20" viewBox="0 0 48 48">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                    <path fill="none" d="M0 0h48v48H0z"/>
                  </svg>
                  Continuar con Google
                </button>
              </div>

              {/* Legal */}
              <p className="text-center text-[10px] pb-2 leading-relaxed" style={{ color: P.muted }}>
                Al continuar aceptas los{" "}
                <span style={{ color: P.brnDk }}>Términos de uso</span> y la{" "}
                <span style={{ color: P.brnDk }}>Política de privacidad</span>.
              </p>
            </div>
          )}

          {step === "join" && (
            <div>
              <button onClick={() => setStep("auth")} className="mb-4 flex items-center gap-1" style={{ color: P.muted }}><ChevronLeft size={16}/><span className="text-xs font-medium">Atrás</span></button>
              <h2 className="text-2xl font-bold mb-1" style={{ fontFamily: "Fraunces, serif", color: P.text }}>Únete a un Nido</h2>
              <p className="text-xs mb-6" style={{ color: P.muted }}>Alguien ya creó un Nido para ti.</p>
              <label className="text-xs font-semibold mb-2 block" style={{ color: P.muted }}>Código de invitación</label>
              <input className="w-full py-3.5 px-4 rounded-2xl text-center text-2xl font-bold tracking-[0.3em] border-2 outline-none mb-4"
                style={{ backgroundColor: P.card, borderColor: joinCode ? P.brnDk : P.sub, color: P.text, fontFamily: "Fraunces, serif" }}
                placeholder="· · · · · ·" maxLength={6} value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} />
              <div className="flex gap-2 mb-6">
                <button className="flex-1 py-3 rounded-2xl flex items-center justify-center gap-2 border text-xs font-semibold"
                  style={{ borderColor: P.border, backgroundColor: P.card, color: P.text }}><Link size={16} style={{ color: P.brnDk }}/>Desde enlace</button>
              </div>
              <OBtn2 label="Unirme al Nido" onClick={() => setStep("p-name")} disabled={joinCode.length < 6} />
            </div>
          )}

          {step === "c-type" && (
            <div>
              <button onClick={() => setStep("welcome")} className="mb-4 flex items-center gap-1" style={{ color: P.muted }}><ChevronLeft size={16}/><span className="text-xs font-medium">Atrás</span></button>
              <h2 className="text-2xl font-bold mb-1" style={{ fontFamily: "Fraunces, serif", color: P.text }}>¿Qué tipo de Nido es?</h2>
              <p className="text-xs mb-6" style={{ color: P.muted }}>Esto nos ayuda a configurarlo mejor.</p>
              <div className="grid grid-cols-4 gap-2 mb-6">
                {NEST_TYPES.map(nt => (
                  <button key={nt.label} onClick={() => set("nestType", nt.label)}
                    className="flex flex-col items-center gap-1.5 py-4 rounded-2xl border-2 transition-all"
                    style={{ borderColor: data.nestType === nt.label ? P.brnDk : "transparent", backgroundColor: data.nestType === nt.label ? P.sagePl : P.sub }}>
                    <span className="text-2xl">{nt.emoji}</span>
                    <span className="text-[9px] font-semibold" style={{ color: P.text }}>{nt.label}</span>
                  </button>
                ))}
              </div>
              <OBtn2 label="Continuar" onClick={() => { if(data.nestType) setStep("c-name"); }} />
            </div>
          )}

          {step === "c-name" && (
            <div>
              <button onClick={() => setStep("auth")} className="mb-4 flex items-center gap-1" style={{ color: P.muted }}><ChevronLeft size={16}/><span className="text-xs font-medium">Atrás</span></button>
              <OProgress2 step={1} total={6} />
              <h2 className="text-2xl font-bold mb-1" style={{ fontFamily: "Fraunces, serif", color: P.text }}>Dale nombre a tu Nido</h2>
              <p className="text-xs mb-6" style={{ color: P.muted }}>Algo que lo haga sentir especial.</p>
              <input className="w-full py-4 px-4 rounded-2xl text-lg font-semibold border-2 outline-none mb-2 transition-all"
                style={{ backgroundColor: P.card, borderColor: data.nestName ? P.brnDk : P.sub, color: P.text }}
                placeholder="Casa Roma, Depa 502…" value={data.nestName} onChange={e => set("nestName",e.target.value)} />
              <div className="flex flex-wrap gap-2 mb-6">
                {NIDO_NAMES.map(n => (
                  <button key={n} onClick={() => set("nestName",n)}
                    className="text-xs font-medium px-3 py-1.5 rounded-full border"
                    style={{ borderColor: P.border, backgroundColor: P.sub, color: P.muted }}>{n}</button>
                ))}
              </div>
              <OBtn2 label="Continuar" onClick={() => setStep("p-name")} disabled={!data.nestName} />
            </div>
          )}

          {step === "c-invite" && (
            <div>
              <button onClick={() => setStep("p-contrib")} className="mb-4 flex items-center gap-1" style={{ color: P.muted }}><ChevronLeft size={16}/><span className="text-xs font-medium">Atrás</span></button>
              <h2 className="text-2xl font-bold mb-1" style={{ fontFamily: "Fraunces, serif", color: P.text }}>Invita a los miembros</h2>
              <p className="text-xs mb-4" style={{ color: P.muted }}>Pueden unirse ahora o más tarde.</p>
              <div className="flex justify-center mb-6"><NidoHouse /></div>
              <div className="space-y-2 mb-6">
                {[{ icon: Link, label: "Invitar por enlace", sub: "Comparte un link directo" }, { icon: Mail, label: "Invitar por email", sub: "Envía una invitación" }].map(({ icon: Icon, label, sub }) => (
                  <button key={label} className="w-full flex items-center gap-3 p-4 rounded-2xl border text-left"
                    style={{ borderColor: P.border, backgroundColor: P.card }}>
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: P.sagePl }}><Icon size={16} style={{ color: P.sageDk }}/></div>
                    <div><p className="text-xs font-semibold" style={{ color: P.text }}>{label}</p><p className="text-[10px]" style={{ color: P.muted }}>{sub}</p></div>
                  </button>
                ))}
              </div>
              <OBtn2 label="Crear mi Nido 🪺" onClick={() => setStep("nest-ready")} />
            </div>
          )}

          {isPers && (
            <div>
              <button onClick={() => setStep(data.flow==="join"&&step==="p-name"?"join":PERSONAL[pIdx-1]||"c-name")}
                className="mb-4 flex items-center gap-1" style={{ color: P.muted }}><ChevronLeft size={16}/><span className="text-xs font-medium">Atrás</span></button>
              <OProgress2 step={pIdx+2} total={6} />

              {step === "p-name" && (
                <>
                  <h2 className="text-2xl font-bold mb-1" style={{ fontFamily: "Fraunces, serif", color: P.text }}>¿Cómo te llamas?</h2>
                  <p className="text-xs mb-5" style={{ color: P.muted }}>Tu nombre aparecerá en el Nido. Puedes editarlo.</p>
                  {/* Google badge */}
                  <div className="flex items-center gap-2 mb-5 px-3 py-2 rounded-2xl" style={{ backgroundColor: P.sub }}>
                    <svg width="14" height="14" viewBox="0 0 48 48" className="flex-shrink-0">
                      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                    </svg>
                    <p className="text-[11px]" style={{ color: P.muted }}>
                      Conectado como <span className="font-semibold" style={{ color: P.text }}>diana.valdes@gmail.com</span>
                    </p>
                  </div>
                  <div className="flex justify-center mb-5">
                    <div className="w-20 h-20 rounded-full flex items-center justify-center text-3xl font-bold text-white shadow-md"
                      style={{ backgroundColor: P.brnDk }}>
                      {data.userName ? data.userName[0].toUpperCase() : "D"}
                    </div>
                  </div>
                  <input className="w-full py-4 px-4 rounded-2xl text-base font-semibold border-2 outline-none mb-6"
                    style={{ backgroundColor: P.card, borderColor: data.userName ? P.brnDk : "rgba(47,42,40,0.15)", color: P.text }}
                    placeholder="Tu nombre" value={data.userName} onChange={e => set("userName",e.target.value)} />
                  <OBtn2 label="Continuar" onClick={() => setStep("p-income")} disabled={!data.userName} />
                </>
              )}
              {step === "p-income" && (
                <>
                  <h2 className="text-2xl font-bold mb-1" style={{ fontFamily: "Fraunces, serif", color: P.text }}>¿De cuánto es tu ingreso?</h2>
                  <p className="text-xs mb-6" style={{ color: P.muted }}>Esta información es privada y solo la usa Nido para calcular aportaciones.</p>
                  <div className="mb-4">
                    <label className="text-xs font-semibold mb-1.5 block" style={{ color: P.muted }}>Ingreso mensual</label>
                    <input className="w-full py-3.5 px-4 rounded-2xl text-base border-2 outline-none"
                      style={{ backgroundColor: P.card, borderColor: data.salary ? P.brnDk : P.sub, color: P.text }}
                      placeholder="$40,000" type="number"
                      value={data.salary}
                      onChange={e => set("salary", e.target.value)} />
                  </div>
                  <OBtn2 label="Continuar" onClick={() => setStep("p-savings")} disabled={!data.salary} />
                </>
              )}
              {step === "p-savings" && (() => {
                const fmt = (v: string) => {
                  const n = v.replace(/[^0-9.]/g,"");
                  if (!n) return "";
                  const [int, dec] = n.split(".");
                  const intFmt = parseInt(int||"0").toLocaleString("es-MX");
                  return dec !== undefined ? `${intFmt}.${dec.slice(0,2)}` : intFmt;
                };
                const rawPersonal = data.savings.replace(/[^0-9.]/g,"");
                const rawShared   = data.savingsShared.replace(/[^0-9.]/g,"");
                return (
                  <>
                    <h2 className="text-2xl font-bold mb-1" style={{ fontFamily: "Fraunces, serif", color: P.text }}>¿Tienes ahorros?</h2>
                    <p className="text-xs mb-5" style={{ color: P.muted }}>Ambos campos son opcionales — llena los que apliquen.</p>

                    <p className="text-[9px] font-semibold uppercase tracking-widest mb-2" style={{ color: P.muted }}>Ahorros personales</p>
                    <div className="rounded-2xl border-2 px-4 py-3 flex items-center gap-1 mb-3"
                      style={{ backgroundColor: P.card, borderColor: rawPersonal ? P.brnDk : P.sub }}>
                      <span className="text-base font-normal flex-shrink-0" style={{ color: P.muted }}>$</span>
                      <input className="flex-1 text-base bg-transparent outline-none"
                        style={{ color: P.text }}
                        type="text" inputMode="decimal" placeholder="0.00"
                        value={fmt(data.savings)}
                        onChange={e => set("savings", e.target.value.replace(/[^0-9.]/g,""))} />
                    </div>

                    <p className="text-[9px] font-semibold uppercase tracking-widest mb-2" style={{ color: P.muted }}>Ahorros compartidos</p>
                    <div className="rounded-2xl border-2 px-4 py-3 flex items-center gap-1 mb-6"
                      style={{ backgroundColor: P.card, borderColor: rawShared ? P.brnDk : P.sub }}>
                      <span className="text-base font-normal flex-shrink-0" style={{ color: P.muted }}>$</span>
                      <input className="flex-1 text-base bg-transparent outline-none"
                        style={{ color: P.text }}
                        type="text" inputMode="decimal" placeholder="0.00"
                        value={fmt(data.savingsShared)}
                        onChange={e => set("savingsShared", e.target.value.replace(/[^0-9.]/g,""))} />
                    </div>

                    <OBtn2 label="Continuar" onClick={() => setStep("p-expenses")} />
                  </>
                );
              })()}
              {step === "p-expenses" && (() => {
                const showAddCustom = data._showAdd ?? false;
                const setShowAddCustom = (v: boolean) => setData(p => ({ ...p, _showAdd: v }));
                const customEmoji = data._emoji ?? "💳";
                const setCustomEmoji = (v: string) => setData(p => ({ ...p, _emoji: v }));
                const customName = data._cname ?? "";
                const setCustomName = (v: string) => setData(p => ({ ...p, _cname: v }));
                const customEtype = data._etype ?? "personal";
                const setCustomEtype = (v: "personal"|"shared") => setData(p => ({ ...p, _etype: v }));

                const canContinue = data.expenses.some(e => e.selected);

                const addCustom = () => {
                  if (!customName.trim()) return;
                  const n = [...data.expenses, { name: customName.trim(), icon: customEmoji, selected: false, amount: "", type: customEtype }];
                  setData(p => ({ ...p, expenses: n, _showAdd: false, _cname: "", _emoji: "💳", _etype: "personal" } as OData));
                };

                const QUICK_EMOJIS = ["💳","🎓","🏋️","🛍️","💅","🍺","🐱","🐕","🏥","✈️","📚","🎮","🧘","🚲","🎸"];

                return (
                  <>
                    <h2 className="text-2xl font-bold mb-1" style={{ fontFamily: "Fraunces, serif", color: P.text }}>Gastos del nido</h2>
                    <p className="text-xs mb-4" style={{ color: P.muted }}>Toca un gasto para agregar el monto y definir si es personal o compartido.</p>

                    {/* Expense rows */}
                    <div className="space-y-2 mb-3">
                      {data.expenses.map((exp, i) => {
                        const done = exp.selected && !!exp.amount;
                        return (
                          <button key={`${exp.name}-${i}`}
                            onClick={() => setExpEditIdx(i)}
                            className="w-full flex items-center gap-3 p-3.5 rounded-2xl border-2 transition-all text-left"
                            style={{
                              borderColor: done ? P.brnDk : "rgba(47,42,40,0.15)",
                              backgroundColor: P.card,
                            }}>
                            <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                              style={{ backgroundColor: done ? P.brnDk : "transparent", border: `2px solid ${done ? P.brnDk : "rgba(47,42,40,0.2)"}` }}>
                              {done && <Check size={12} color="#fff" />}
                            </div>
                            <span className="text-sm flex-shrink-0">{exp.icon}</span>
                            <span className="text-xs font-medium flex-1 text-left truncate" style={{ color: P.text }}>{exp.name}</span>
                            {done && (
                              <>
                                <span className="text-xs font-bold flex-shrink-0" style={{ color: P.text }}>
                                  ${parseInt(exp.amount).toLocaleString("es-MX")}
                                </span>
                                <span className="text-sm flex-shrink-0 ml-1">
                                  {exp.type === "personal" ? "👤" : "🏠"}
                                </span>
                              </>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {/* Add custom expense */}
                    {!showAddCustom ? (
                      <button onClick={() => setShowAddCustom(true)}
                        className="w-full flex items-center gap-2 py-3 px-4 rounded-2xl border-2 border-dashed mb-3 transition-all"
                        style={{ borderColor: P.border, backgroundColor: "transparent", color: P.muted }}>
                        <span className="text-base">➕</span>
                        <span className="text-xs font-semibold">Agregar otro gasto</span>
                      </button>
                    ) : (
                      <div className="rounded-2xl border-2 p-4 mb-3" style={{ borderColor: P.brnDk, backgroundColor: P.sagePl }}>
                        <p className="text-[9px] font-semibold uppercase tracking-widest mb-3" style={{ color: P.muted }}>Nuevo gasto personalizado</p>
                        <div className="flex gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden mb-3 pb-0.5">
                          {QUICK_EMOJIS.map(e => (
                            <button key={e} onClick={() => setCustomEmoji(e)}
                              className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-lg transition-all"
                              style={{ backgroundColor: customEmoji === e ? P.brnDk + "20" : P.card, border: `2px solid ${customEmoji === e ? P.brnDk : "transparent"}` }}>
                              {e}
                            </button>
                          ))}
                        </div>
                        <div className="flex gap-2 mb-3">
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0" style={{ backgroundColor: P.card }}>
                            {customEmoji}
                          </div>
                          <input
                            className="flex-1 rounded-xl px-3 py-2 text-xs font-medium outline-none border-2"
                            style={{ backgroundColor: P.card, borderColor: customName ? P.brnDk : P.border, color: P.text }}
                            placeholder="Nombre del gasto (ej. Masajes)"
                            value={customName}
                            onChange={e => setCustomName(e.target.value)}
                          />
                        </div>
                        <div className="flex gap-1.5 mb-3">
                          {([{ val: "personal" as const, label: "Personal", emoji: "👤" }, { val: "shared" as const, label: "Compartido", emoji: "🏠" }]).map(t => (
                            <button key={t.val} onClick={() => setCustomEtype(t.val)}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all"
                              style={{ backgroundColor: customEtype === t.val ? P.brnDk : P.card, color: customEtype === t.val ? "#fff" : P.muted }}>
                              <span>{t.emoji}</span>{t.label}
                            </button>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => setShowAddCustom(false)}
                            className="flex-1 py-2.5 rounded-xl text-xs font-semibold border"
                            style={{ borderColor: P.border, backgroundColor: P.card, color: P.muted }}>
                            Cancelar
                          </button>
                          <button onClick={addCustom} disabled={!customName.trim()}
                            className="flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all"
                            style={{ backgroundColor: customName.trim() ? P.brnDk : P.sub, color: customName.trim() ? "#fff" : P.muted }}>
                            Agregar
                          </button>
                        </div>
                      </div>
                    )}

                  </>
                );
              })()}
              {step === "p-contrib" && (
                <>
                  <h2 className="text-2xl font-bold mb-1" style={{ fontFamily: "Fraunces, serif", color: P.text }}>¿Cómo dividir los gastos?</h2>
                  <p className="text-xs mb-5" style={{ color: P.muted }}>Puedes cambiarlo cuando quieras.</p>
                  <div className="space-y-2 mb-6">
                    {([
                      { id:"equal" as Model,        emoji:"⚖️", label:"Por partes iguales",         sub:"Los gastos se dividirán en partes iguales entre los miembros del nido" },
                      { id:"proportional" as Model, emoji:"📊", label:"Proporcional al ingreso",     sub:"Según cuánto gana cada quien" },
                      { id:"capacity" as Model,     emoji:"💡", label:"Capacidad de aportación",     sub:"Cada quien aporta según lo que le sobra después de cubrir sus gastos fijos personales", rec:true },
                    ] as const).map(opt => (
                      <button key={opt.id} onClick={() => set("contrib",opt.id)}
                        className="w-full flex items-center gap-3 p-4 rounded-2xl border-2 text-left transition-all"
                        style={{ borderColor: data.contrib===opt.id ? P.brnDk : "rgba(47,42,40,0.15)", backgroundColor: P.card }}>
                        <span className="text-xl flex-shrink-0">{opt.emoji}</span>
                        <div className="flex-1">
                          <p className="text-xs font-semibold" style={{ color: P.text }}>{opt.label}</p>
                          <p className="text-[9px]" style={{ color: P.muted }}>{opt.sub}</p>
                        </div>
                        {"rec" in opt && opt.rec && (
                          <span className="text-[9px] font-bold rounded-full px-2 py-0.5" style={{ backgroundColor: P.brnDk, color:"#fff" }}>✦ IDEAL</span>
                        )}
                      </button>
                    ))}
                  </div>
                  <OBtn2 label="Finalizar nido 🪺" onClick={() => setStep(data.flow === "create" ? "c-invite" : "nest-ready")} />
                </>
              )}
            </div>
          )}

          {step === "nest-ready" && (
            <div className="flex flex-col h-full">
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <NidoHouse />
                <h2 className="text-2xl font-bold mt-4 mb-1" style={{ fontFamily: "Fraunces, serif", color: P.text }}>¡Tu Nido está casi listo!</h2>
                <p className="text-xs mb-6" style={{ color: P.muted }}>Solo falta un miembro por configurar.</p>
                <div className="w-full bg-white rounded-3xl p-4 mb-6 text-left shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm" style={{ backgroundColor: P.sub }}>⏳</div>
                    <span className="text-xs font-semibold" style={{ color: P.text }}>Esperando a:</span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-2xl" style={{ backgroundColor: P.sub }}>
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-[#5BA4CF] flex items-center justify-center text-white text-xs font-bold">CR</div>
                      <div>
                        <p className="text-xs font-semibold" style={{ color: P.text }}>Carlos</p>
                        <p className="text-[10px]" style={{ color: P.muted }}>Completar perfil · ~2 min</p>
                      </div>
                    </div>
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#D4AC4E" }} />
                  </div>
                </div>
                <div className="w-full p-3 rounded-2xl flex gap-2 mb-2" style={{ backgroundColor: P.sagePl }}>
                  <Sparkles size={13} style={{ color: P.sageDk, flexShrink:0, marginTop:1 }} />
                  <p className="text-[10px] leading-relaxed" style={{ color: P.text }}>Tu Nido funciona aunque Carlos no haya completado su perfil todavía.</p>
                </div>
              </div>
              <OBtn2 label="Entrar a mi Nido 🪺" onClick={onComplete} />
            </div>
          )}
        </div>

        {/* Fixed continue bar for p-expenses */}
        {step === "p-expenses" && (
          <div className="flex-shrink-0 px-6 pb-6 pt-3 border-t" style={{ backgroundColor: P.bgL, borderColor: P.border }}>
            <button onClick={() => expCanContinue && setStep("p-contrib")}
              className="w-full py-4 rounded-2xl font-semibold text-sm transition-all active:scale-[0.98]"
              style={{ backgroundColor: expCanContinue ? P.brnDk : P.sub, color: expCanContinue ? "#fff" : P.muted, cursor: expCanContinue ? "pointer" : "not-allowed" }}>
              Continuar
            </button>
          </div>
        )}

        {/* Expense entry modal */}
        {expEditIdx !== null && (
          <ExpenseEntryModal
            exp={data.expenses[expEditIdx]}
            onConfirm={handleExpConfirm}
            onClose={() => setExpEditIdx(null)}
          />
        )}
    </div>
  );
}

// ── PROFILE PANEL ─────────────────────────────────────────────────────────────
const DIANA_EXTRAS = [
  { name: "Cena cumpleaños", amount: 1800, icon: "🎂", date: "12 ago" },
  { name: "Farmacia",        amount: 340,  icon: "💊", date: "9 ago"  },
  { name: "Uber",            amount: 215,  icon: "🚕", date: "7 ago"  },
];

function ProfilePanel({ onClose, onLogout }: { onClose: () => void; onLogout: () => void }) {
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
          <div className="w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-bold mb-3 shadow-md" style={{ backgroundColor: P.sage }}>DV</div>
          <p className="text-base font-bold mb-0.5" style={{ fontFamily: "Fraunces, serif", color: P.text }}>Diana Valdés</p>
          <p className="text-xs" style={{ color: P.muted }}>diana.valdes@gmail.com</p>
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
          <button onClick={onLogout}
            className="w-full py-3.5 rounded-2xl text-sm font-semibold border transition-all active:scale-[0.98]"
            style={{ color: P.danger, borderColor: `${P.danger}30`, backgroundColor: P.dangerBg }}>
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
}

// ── MAIN APP ──────────────────────────────────────────────────────────────────
function MainApp({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab]           = useState<Tab>("home");
  const [model, setModel]       = useState<Model>("capacity");
  const [showSheet, setShowSheet] = useState(false);
  const [activeFlow, setActiveFlow] = useState<Flow>(null);
  const [profileOpen, setProfileOpen] = useState(false);

  const tabs = [
    { id: "home"      as Tab, icon: Home,     label: "Inicio"    },
    { id: "budget"    as Tab, icon: BarChart2, label: "Gastos"   },
    { id: "goals"     as Tab, icon: Target,    label: "Metas"    },
    { id: "household" as Tab, icon: Users,     label: "Hogar"    },
    { id: "activity"  as Tab, icon: Clock,     label: "Actividad"},
  ];

  const handleFlowDone = () => {
    setActiveFlow(null);
  };

  return (
    <div className="relative min-h-screen flex flex-col overflow-hidden"
      style={{ backgroundColor: P.bgL, fontFamily: "Figtree, sans-serif" }}>
        <div className="flex-1 overflow-hidden">
          {tab === "home"      && <HomeScreen onProfileOpen={() => setProfileOpen(true)} onNavigate={t => { setTab(t); setShowSheet(false); }} />}
          {tab === "budget"    && <BudgetScreen />}
          {tab === "goals"     && <GoalsScreen />}
          {tab === "household" && <HouseholdScreen model={model} setModel={setModel} />}
          {tab === "activity"  && <ActivityScreen />}
        </div>

        {/* Bottom nav */}
        <div className="flex-shrink-0 border-t" style={{ backgroundColor: "rgba(255,252,250,0.96)", backdropFilter: "blur(20px)", borderColor: P.border, paddingBottom: "1.25rem" }}>
          <div className="flex items-center justify-around pt-1.5">
            {tabs.map(({ id, icon: Icon, label }) => (
              <button key={id} onClick={() => { setTab(id); setShowSheet(false); }}
                className="flex flex-col items-center gap-0.5 px-2 py-1 transition-all">
                <div className="w-10 h-9 flex items-center justify-center rounded-2xl transition-all"
                  style={{ backgroundColor: tab === id ? P.brnDk : "transparent" }}>
                  <Icon size={18} style={{ color: tab === id ? "#fff" : P.muted }} />
                </div>
                <span className="text-[9px] font-semibold" style={{ color: tab === id ? P.brnDk : P.muted }}>{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* FAB */}
        <button
          onClick={() => setShowSheet(true)}
          className="absolute flex items-center justify-center transition-all active:scale-95 z-20"
          style={{ bottom: "6.5rem", right: "1.25rem", width: "3.25rem", height: "3.25rem",
            backgroundColor: P.brnDk, borderRadius: "1rem",
            boxShadow: `0 8px 24px rgba(102,90,72,0.45)` }}>
          <Plus size={22} color="white" />
        </button>

        {/* Action sheet */}
        {showSheet && (
          <ActionSheet
            onSelect={(f) => { setShowSheet(false); setActiveFlow(f); }}
            onClose={() => setShowSheet(false)}
          />
        )}

        {/* Expense flow */}
        {activeFlow === "expense" && (
          <ExpenseFlow onClose={() => setActiveFlow(null)} onDone={() => handleFlowDone()} />
        )}

        {/* Goal flow */}
        {activeFlow === "goal" && (
          <GoalFlow onClose={() => setActiveFlow(null)} />
        )}

        {/* Contribution flow */}
        {activeFlow === "contrib" && (
          <ContribFlow onClose={() => setActiveFlow(null)} />
        )}

        {/* Profile panel */}
        {profileOpen && (
          <ProfilePanel
            onClose={() => setProfileOpen(false)}
            onLogout={onLogout}
          />
        )}
    </div>
  );
}

// ── ROOT ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [mode, setMode] = useState<AppMode>("onboarding");
  return mode === "onboarding"
    ? <OnboardingFlow onComplete={() => setMode("app")} />
    : <MainApp onLogout={() => setMode("onboarding")} />;
}
