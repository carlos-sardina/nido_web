// Product catalogs used by onboarding. Not financial source of truth.

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
  "Retiro":             [1000,  2000,  3000,  5000],
  "Terapia":            [ 500,   800,  1000,  1500],
  "Gym":                [ 300,   500,   800,  1200],
};
export const DEFAULT_QUICK = [500, 1000, 2000, 5000];

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
  { name: "Supermercado",       icon: "🛒", selected: false, amount: "", type: "shared"   as const, kind: "variable"  as const },
  { name: "Restaurantes",       icon: "🍔", selected: false, amount: "", type: "shared"   as const, kind: "variable"  as const },
  { name: "Casetas",            icon: "🛣️", selected: false, amount: "", type: "shared"   as const, kind: "variable"  as const },
  { name: "Limpieza",           icon: "🧹", selected: false, amount: "", type: "shared"   as const, kind: "variable"  as const },
  { name: "Mascotas",           icon: "🐾", selected: false, amount: "", type: "shared"   as const, kind: "variable"  as const },
  { name: "Pago auto",          icon: "🚗", selected: false, amount: "", type: "personal" as const, kind: "recurring" as const },
  { name: "Gym",                icon: "🏋️", selected: false, amount: "", type: "personal" as const, kind: "recurring" as const },
  { name: "Suscripciones",      icon: "📱", selected: false, amount: "", type: "personal" as const, kind: "recurring" as const },
  { name: "Retiro",             icon: "📈", selected: false, amount: "", type: "personal" as const, kind: "recurring" as const },
  { name: "Gasolina",           icon: "⛽", selected: false, amount: "", type: "personal" as const, kind: "variable"  as const },
  { name: "Tarjeta de crédito", icon: "💳", selected: false, amount: "", type: "personal" as const, kind: "variable"  as const },
  { name: "Terapia",            icon: "💆", selected: false, amount: "", type: "personal" as const, kind: "variable"  as const },
];

export function isSuggestedOnboardingExpenseName(name: string): boolean {
  const needle = name.trim().toLowerCase();
  return Boolean(needle) && EXP_SUGG.some((row) => row.name.toLowerCase() === needle);
}
