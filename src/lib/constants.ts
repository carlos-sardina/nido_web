import { P } from "./palette";

// ── DATA ─────────────────────────────────────────────────────────────────────
export const CATS = [
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
export const TOT_S = CATS.reduce((s, c) => s + c.spent, 0);

export const GOALS = [
  { name: "Fondo de emergencia", emoji: "🛡️", target: 200000, current: 120000, monthly: 5000, date: "Oct 2026",  color: "#2F7D66", bg: "#E8F4EF", members: "Diana & Carlos" },
  { name: "Viaje a Japón",       emoji: "✈️",  target: 80000,  current: 28000,  monthly: 4000, date: "Mar 2027",  color: "#D88D9A", bg: "#FDEEF1", members: "Diana & Carlos" },
  { name: "Enganche casa",       emoji: "🏡",  target: 500000, current: 45000,  monthly: 8000, date: "Dic 2030",  color: "#A9C8A6", bg: "#EFF5EE", members: "Diana & Carlos" },
  { name: "Fondo Mochi",         emoji: "🐶",  target: 20000,  current: 12000,  monthly: 2000, date: "Mayo 2026", color: "#C9785D", bg: "#FAF0EC", members: "Diana" },
];

/** Prototype leftover. Actividad uses `model.activity` from `useDashboard()`, not this list. */
export const FEED = [
  { user: "Carlos", action: "pagó Internet",       amount: 700,   time: "Hace 2h",     icon: "📡", type: "expense"   },
  { user: "Diana",  action: "compró supermercado", amount: 1200,  time: "Hace 5h",     icon: "🛒", type: "expense"   },
  {                 action: "Fondo emergencia al 60%",            time: "Ayer",         icon: "🛡️", type: "milestone" },
  { user: "Diana",  action: "pagó renta",          amount: 20000, time: "Hace 2 días", icon: "🏠", type: "expense"   },
  {                 action: "Restaurantes sobre plan",            time: "Hace 3 días", icon: "⚠️", type: "alert"     },
  { user: "Carlos", action: "aportó a Japón",      amount: 4000,  time: "Hace 4 días", icon: "✈️", type: "goal"      },
  {                 action: "Ahorraron $12k este mes",            time: "Hace 5 días", icon: "✨", type: "insight"   },
];

export const LIFE_EVENTS = [
  { emoji: "🏡", name: "Comprar casa",    active: false },
  { emoji: "👶", name: "Tener un bebé",   active: false },
  { emoji: "🚗", name: "Nuevo auto",      active: false },
  { emoji: "🐶", name: "Adoptar mascota", active: true  },
  { emoji: "💍", name: "Boda",            active: false },
  { emoji: "✈️", name: "Vacaciones",      active: true  },
  { emoji: "🎓", name: "Maestría",        active: false },
  { emoji: "💼", name: "Negocio propio",  active: false },
];

export const EXP_CATS = [
  { name: "Vivienda",        icon: "🏠" }, { name: "Despensa",   icon: "🛒" },
  { name: "Restaurantes",    icon: "🍔" }, { name: "Transporte", icon: "🚗" },
  { name: "Mascotas",        icon: "🐶" }, { name: "Servicios",  icon: "⚡" },
  { name: "Limpieza",        icon: "🧹" }, { name: "Entretenim.", icon: "🎬" },
  { name: "Salud",           icon: "❤️" }, { name: "Educación",  icon: "🎓" },
  { name: "Trabajo",         icon: "💼" }, { name: "Otra",       icon: "➕" },
];

export const GOAL_TYPES = [
  { name: "Fondo emerg.", emoji: "🛟" }, { name: "Vacaciones", emoji: "✈️" },
  { name: "Casa",         emoji: "🏠" }, { name: "Auto",       emoji: "🚗" },
  { name: "Muebles",      emoji: "🛋️" }, { name: "Mascotas",   emoji: "🐶" },
  { name: "Bebé",         emoji: "👶" }, { name: "Educación",  emoji: "🎓" },
  { name: "Boda",         emoji: "💍" }, { name: "Inversión",  emoji: "📈" },
  { name: "Personalizada",emoji: "✨" },
];

export const QUICK_AMOUNTS: Record<string, number[]> = {
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
export const DEFAULT_QUICK = [500, 1000, 2000, 5000];

export const FREQUENCIES = ["Único","Semanal","Quincenal","Mensual","Bimestral","Semestral","Anual"];

export const SAVE_METHODS = [
  { label: "Automáticamente cada mes", icon: "🔄" },
  { label: "Cada quien decide cuándo", icon: "🕐" },
  { label: "Aportación fija",          icon: "💰" },
  { label: "Aportación proporcional",  icon: "📊" },
  { label: "Según capacidad",          icon: "💡" },
];

export const NIDO_NAMES = [
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

export const NEST_TYPES = [
  { emoji: "🏠", label: "Pareja"       }, { emoji: "🏡", label: "Familia"      },
  { emoji: "🛋️", label: "Roommates"    }, { emoji: "✈️", label: "Viaje"        },
  { emoji: "🎉", label: "Evento"       }, { emoji: "💼", label: "Negocio"      },
  { emoji: "👨‍👩‍👧", label: "Con hijos"  }, { emoji: "✨", label: "Personalizado" },
];

export const EXP_SUGG = [
  { name: "Renta",              icon: "🏢", selected: false, amount: "", type: "shared"   as const, kind: "recurring" as const },
  { name: "Internet",           icon: "📡", selected: false, amount: "", type: "shared"   as const, kind: "recurring" as const },
  { name: "Luz",                icon: "💡", selected: false, amount: "", type: "shared"   as const, kind: "recurring" as const },
  { name: "Gas",                icon: "🔥", selected: false, amount: "", type: "shared"   as const, kind: "recurring" as const },
  { name: "Agua",               icon: "💧", selected: false, amount: "", type: "shared"   as const, kind: "recurring" as const },
  { name: "Pago auto",          icon: "🚗", selected: false, amount: "", type: "personal" as const, kind: "recurring" as const },
  { name: "Seguro médico",      icon: "🏥", selected: false, amount: "", type: "personal" as const, kind: "recurring" as const },
  { name: "Gym",                icon: "🏋️", selected: false, amount: "", type: "personal" as const, kind: "recurring" as const },
  { name: "Suscripciones",      icon: "📱", selected: false, amount: "", type: "personal" as const, kind: "recurring" as const },
  { name: "Retiro",             icon: "📈", selected: false, amount: "", type: "personal" as const, kind: "recurring" as const },
  { name: "Supermercado",       icon: "🛒", selected: false, amount: "", type: "shared"   as const, kind: "variable"  as const },
  { name: "Restaurantes",       icon: "🍔", selected: false, amount: "", type: "shared"   as const, kind: "variable"  as const },
  { name: "Gasolina",           icon: "⛽", selected: false, amount: "", type: "personal" as const, kind: "variable"  as const },
  { name: "Casetas",            icon: "🛣️", selected: false, amount: "", type: "shared"   as const, kind: "variable"  as const },
  { name: "Limpieza",           icon: "🧹", selected: false, amount: "", type: "shared"   as const, kind: "variable"  as const },
  { name: "Mascotas",           icon: "🐾", selected: false, amount: "", type: "shared"   as const, kind: "variable"  as const },
  { name: "Tarjeta de crédito", icon: "💳", selected: false, amount: "", type: "personal" as const, kind: "variable"  as const },
  { name: "Terapia",            icon: "💆", selected: false, amount: "", type: "personal" as const, kind: "variable"  as const },
];
