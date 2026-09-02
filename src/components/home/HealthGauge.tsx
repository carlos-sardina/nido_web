"use client";

import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import type { HealthTone } from "@/lib/nido/financial";
import { P } from "@/lib/palette";

const GAUGE_FILL: Record<Exclude<HealthTone, "pending">, string> = {
  excellent: P.sageLt,
  stable: P.sageLt,
  attention: "#E8C4A0",
  critical: "#E8B4A8",
};

export function HealthGauge({
  score,
  tone = "stable",
}: {
  score: number;
  tone?: Exclude<HealthTone, "pending">;
}) {
  const filled = Math.min(100, Math.max(0, score));
  const data = [{ v: filled }, { v: Math.max(0, 100 - filled) }];
  return (
    <div className="relative w-28 h-[68px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
          <Pie
            data={data}
            dataKey="v"
            cx="50%"
            cy="100%"
            startAngle={180}
            endAngle={0}
            innerRadius={40}
            outerRadius={52}
            strokeWidth={0}
          >
            <Cell fill={GAUGE_FILL[tone]} />
            <Cell fill="rgba(255,255,255,0.15)" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-x-0 flex justify-center" style={{ bottom: 4 }}>
        <span className="text-2xl font-bold text-white leading-none" style={{ fontFamily: "Fraunces, serif" }}>{score}</span>
      </div>
    </div>
  );
}
