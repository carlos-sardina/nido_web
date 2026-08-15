import fs from "fs";
import path from "path";

const root = path.resolve(import.meta.dirname, "..");
const src = fs.readFileSync(path.join(root, "src/app/App.tsx"), "utf8");
const lines = src.split("\n");

function slice(start, end) {
  return lines.slice(start - 1, end).join("\n");
}

function writeFile(rel, content) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

// ── lib ──
writeFile(
  "src/lib/palette.ts",
  slice(10, 42).replace(/^const P = /, "export const P = ")
);

writeFile(
  "src/lib/types.ts",
  `import type { EXP_SUGG } from "./constants";

export type AppMode = "onboarding" | "app";
export type OStep   = "welcome"|"auth"|"join"|"c-type"|"c-name"|"c-invite"|
               "p-name"|"p-income"|"p-savings"|"p-expenses"|"p-contrib"|"nest-ready";
export type Tab     = "home"|"budget"|"goals"|"household"|"activity";
export type Model   = "equal"|"proportional"|"capacity";
export type Flow    = null|"expense"|"goal"|"contrib";

export interface OData {
  flow: "join"|"create"|null; nestType: string; nestEmoji: string; nestName: string;
  userName: string; salary: string; freelance: string; savings: string;
  savingsType: "personal" | "shared" | "both";
  savingsShared: string;
  expenses: typeof EXP_SUGG; contrib: Model;
  _showAdd?: boolean; _emoji?: string; _cname?: string; _etype?: "personal"|"shared";
}
`
);

const constantsBody = slice(52, 173);
writeFile(
  "src/lib/constants.ts",
  `import { P } from "./palette";

${constantsBody.replace(/^const /gm, "export const ")}

export const NEST_TYPES = [
  { emoji: "🏠", label: "Pareja"       }, { emoji: "🏡", label: "Familia"      },
  { emoji: "🛋️", label: "Roommates"    }, { emoji: "✈️", label: "Viaje"        },
  { emoji: "🎉", label: "Evento"       }, { emoji: "💼", label: "Negocio"      },
  { emoji: "👨‍👩‍👧", label: "Con hijos"  }, { emoji: "✨", label: "Personalizado" },
];

export const EXP_SUGG = [
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

export const DIANA_EXTRAS = [
  { name: "Cena cumpleaños", amount: 1800, icon: "🎂", date: "12 ago" },
  { name: "Farmacia",        amount: 340,  icon: "💊", date: "9 ago"  },
  { name: "Uber",            amount: 215,  icon: "🚕", date: "7 ago"  },
];
`
);

writeFile(
  "src/lib/helpers.ts",
  slice(175, 177).replace(/^const /gm, "export const ")
);

function exportFn(body, exportName) {
  return body.replace(/^function /, "export function ");
}

const components = [
  {
    file: "src/components/shared/NidoHouse.tsx",
    imports: `import { P } from "@/lib/palette";\n\n`,
    body: slice(180, 219),
  },
  {
    file: "src/components/shared/FlowHeader.tsx",
    imports: `import { ChevronLeft, X } from "lucide-react";\nimport { P } from "@/lib/palette";\n\n`,
    body: slice(222, 238),
  },
  {
    file: "src/components/shared/PBtn.tsx",
    imports: `import { P } from "@/lib/palette";\n\n`,
    body: slice(240, 252),
  },
  {
    file: "src/components/flows/ActionSheet.tsx",
    imports: `import { ChevronRight } from "lucide-react";\nimport { P } from "@/lib/palette";\nimport type { Flow } from "@/lib/types";\nimport { PBtn } from "@/components/shared/PBtn";\n\n`,
    body: slice(255, 287),
  },
  {
    file: "src/components/flows/InviteQrModal.tsx",
    imports: `import { QrCode, X } from "lucide-react";\nimport { P } from "@/lib/palette";\nimport { PBtn } from "@/components/shared/PBtn";\n\n`,
    body: slice(290, 322),
  },
  {
    file: "src/components/flows/ExpenseFlow.tsx",
    imports: `"use client";\n\nimport { useState } from "react";\nimport { Camera } from "lucide-react";\nimport {\n  CATS, D_CAP, D_INC, EXP_CATS, FREQUENCIES, T_CAP, T_INC,\n} from "@/lib/constants";\nimport { $k, pct } from "@/lib/helpers";\nimport { P } from "@/lib/palette";\nimport { FlowHeader } from "@/components/shared/FlowHeader";\nimport { PBtn } from "@/components/shared/PBtn";\n\n`,
    body: slice(325, 550),
  },
  {
    file: "src/components/flows/GoalFlow.tsx",
    imports: `"use client";\n\nimport { useState } from "react";\nimport { Camera } from "lucide-react";\nimport { GOAL_TYPES, SAVE_METHODS } from "@/lib/constants";\nimport { $k } from "@/lib/helpers";\nimport { P } from "@/lib/palette";\nimport { FlowHeader } from "@/components/shared/FlowHeader";\nimport { PBtn } from "@/components/shared/PBtn";\n\n`,
    body: slice(553, 713),
  },
  {
    file: "src/components/flows/ContribFlow.tsx",
    imports: `"use client";\n\nimport { useState } from "react";\nimport { GOALS } from "@/lib/constants";\nimport { $k, pct } from "@/lib/helpers";\nimport { P } from "@/lib/palette";\nimport { FlowHeader } from "@/components/shared/FlowHeader";\nimport { PBtn } from "@/components/shared/PBtn";\n\n`,
    body: slice(716, 812),
  },
  {
    file: "src/components/home/HealthGauge.tsx",
    imports: `"use client";\n\nimport { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";\nimport { P } from "@/lib/palette";\n\n`,
    body: slice(815, 833),
  },
  {
    file: "src/components/home/HomeScreen.tsx",
    imports: `import { Shield } from "lucide-react";\nimport { CATS, FEED, GOALS, TOT_B, TOT_S } from "@/lib/constants";\nimport { $k, pct } from "@/lib/helpers";\nimport { P } from "@/lib/palette";\nimport type { Tab } from "@/lib/types";\nimport { HealthGauge } from "@/components/home/HealthGauge";\n\n`,
    body: slice(836, 976),
  },
  {
    file: "src/components/budget/BudgetScreen.tsx",
    imports: `"use client";\n\nimport { useState } from "react";\nimport { CATS, TOT_B, TOT_S } from "@/lib/constants";\nimport { $k, pct } from "@/lib/helpers";\nimport { P } from "@/lib/palette";\n\n`,
    body: slice(979, 1054),
  },
  {
    file: "src/components/goals/GoalsScreen.tsx",
    imports: `import { Clock } from "lucide-react";\nimport { GOALS } from "@/lib/constants";\nimport { $k, pct } from "@/lib/helpers";\nimport { P } from "@/lib/palette";\n\n`,
    body: slice(1057, 1127),
  },
  {
    file: "src/components/household/HouseholdScreen.tsx",
    imports: `"use client";\n\nimport { useState } from "react";\nimport {\n  C_CAP, C_INC, D_CAP, D_INC, D_PER, DIANA_ITEMS, LIFE_EVENTS, TOT_B, T_CAP, T_INC,\n} from "@/lib/constants";\nimport { $k } from "@/lib/helpers";\nimport { P } from "@/lib/palette";\nimport type { Model } from "@/lib/types";\n\n`,
    body: slice(1130, 1239),
  },
  {
    file: "src/components/activity/ActivityScreen.tsx",
    imports: `import { Sparkles } from "lucide-react";\nimport { FEED } from "@/lib/constants";\nimport { $k } from "@/lib/helpers";\nimport { P } from "@/lib/palette";\n\n`,
    body: slice(1242, 1296),
  },
  {
    file: "src/components/onboarding/ExpenseEntryModal.tsx",
    imports: `"use client";\n\nimport { useState } from "react";\nimport { X } from "lucide-react";\nimport { DEFAULT_QUICK, EXP_SUGG, QUICK_AMOUNTS } from "@/lib/constants";\nimport { P } from "@/lib/palette";\n\n`,
    body: slice(1335, 1432),
  },
  {
    file: "src/components/onboarding/OProgress2.tsx",
    imports: `import { P } from "@/lib/palette";\n\n`,
    body: slice(1434, 1442),
  },
  {
    file: "src/components/onboarding/OBtn2.tsx",
    imports: `import { P } from "@/lib/palette";\n\n`,
    body: slice(1443, 1452),
  },
  {
    file: "src/components/onboarding/OnboardingFlow.tsx",
    imports: `"use client";\n\nimport { useState } from "react";\nimport {\n  Check, ChevronLeft, Link, QrCode, Sparkles,\n} from "lucide-react";\nimport { EXP_SUGG, NEST_TYPES, NIDO_NAMES } from "@/lib/constants";\nimport { P } from "@/lib/palette";\nimport type { Model, OStep, OData } from "@/lib/types";\nimport { InviteQrModal } from "@/components/flows/InviteQrModal";\nimport { NidoHouse } from "@/components/shared/NidoHouse";\nimport { ExpenseEntryModal } from "@/components/onboarding/ExpenseEntryModal";\nimport { OBtn2 } from "@/components/onboarding/OBtn2";\nimport { OProgress2 } from "@/components/onboarding/OProgress2";\n\n`,
    body: slice(1454, 1957),
  },
  {
    file: "src/components/flows/ProfilePanel.tsx",
    imports: `import { ChevronLeft } from "lucide-react";\nimport { DIANA_EXTRAS, DIANA_ITEMS } from "@/lib/constants";\nimport { $k } from "@/lib/helpers";\nimport { P } from "@/lib/palette";\n\n`,
    body: slice(1966, 2039),
  },
  {
    file: "src/components/MainApp.tsx",
    imports: `"use client";\n\nimport { useState } from "react";\nimport {\n  BarChart2, Clock, Home, Plus, Target, Users,\n} from "lucide-react";\nimport { ActivityScreen } from "@/components/activity/ActivityScreen";\nimport { BudgetScreen } from "@/components/budget/BudgetScreen";\nimport { ActionSheet } from "@/components/flows/ActionSheet";\nimport { ContribFlow } from "@/components/flows/ContribFlow";\nimport { ExpenseFlow } from "@/components/flows/ExpenseFlow";\nimport { GoalFlow } from "@/components/flows/GoalFlow";\nimport { ProfilePanel } from "@/components/flows/ProfilePanel";\nimport { GoalsScreen } from "@/components/goals/GoalsScreen";\nimport { HomeScreen } from "@/components/home/HomeScreen";\nimport { HouseholdScreen } from "@/components/household/HouseholdScreen";\nimport { P } from "@/lib/palette";\nimport type { Flow, Model, Tab } from "@/lib/types";\n\n`,
    body: slice(2042, 2130),
  },
];

for (const { file, imports, body } of components) {
  writeFile(file, imports + exportFn(body) + "\n");
}

writeFile(
  "src/app/App.tsx",
  `"use client";\n\nimport { useState } from "react";\nimport { MainApp } from "@/components/MainApp";\nimport { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";\nimport type { AppMode } from "@/lib/types";\n\n${slice(2133, 2138).replace(/^export default function App/, "export default function App")}\n`
);

console.log("Extraction complete.");
