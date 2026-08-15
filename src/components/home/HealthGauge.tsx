"use client";

import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { P } from "@/lib/palette";

export function HealthGauge({ score }: { score: number }) {
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
