import { Shield, Target, type LucideIcon } from "lucide-react";
import type { GoalType } from "@/lib/nido/financial";
import { P } from "@/lib/palette";

export function goalVisual(goalType: GoalType) {
  if (goalType === "saving") {
    return {
      Icon: Shield as LucideIcon,
      well: "#E8F4EF",
      accent: P.sage,
      accentDk: P.sageDk,
      bar: `linear-gradient(90deg, ${P.sage}, ${P.sageDk})`,
      hero: "linear-gradient(135deg, #255D4D 0%, #2F7D66 100%)",
    };
  }
  return {
    Icon: Target as LucideIcon,
    well: "#FDEEF1",
    accent: P.brnDp,
    accentDk: P.brnDp,
    bar: `linear-gradient(90deg, ${P.brn}, ${P.brnDp})`,
    hero: "linear-gradient(135deg, #B87485 0%, #D88D9A 100%)",
  };
}
