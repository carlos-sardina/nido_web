"use client";

import { useMemo } from "react";
import {
  dailySpendSeries,
  formatCompactMoney,
  formatExactMoney,
  isDateInRange,
  type IncomeRow,
  type MonthRange,
  type ExpenseRow,
} from "@/lib/nido/financial";
import { P } from "@/lib/palette";
import { HOME_CARD_SHADOW } from "@/components/home/home-card";

function downsample(values: number[], count = 10): number[] {
  if (values.length <= count) return values;
  const out: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const index = Math.round((i * (values.length - 1)) / (count - 1));
    out.push(values[index] ?? 0);
  }
  return out;
}

function cumulative(values: number[]): number[] {
  let running = 0;
  return values.map((value) => {
    running += value;
    return running;
  });
}

function dailyIncomeAmounts(incomes: IncomeRow[], range: MonthRange): number[] {
  const totals = new Map<string, number>();
  for (const income of incomes) {
    if (!isDateInRange(income.occurredAt, range)) continue;
    totals.set(income.occurredAt, (totals.get(income.occurredAt) ?? 0) + income.amount);
  }
  const [year, month] = [range.year, range.month];
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const series: number[] = [];
  for (let day = 1; day <= days; day += 1) {
    const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    series.push(totals.get(date) ?? 0);
  }
  return series;
}

function MiniSparkline({
  values,
  stroke,
  fill,
}: {
  values: number[];
  stroke: string;
  fill: string;
}) {
  const width = 140;
  const height = 48;
  if (values.length < 2) {
    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="mt-3 w-full h-12" aria-hidden="true">
        <path
          d={`M 6 ${height - 12} L ${width - 6} ${height - 12}`}
          fill="none"
          stroke={stroke}
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = Math.max(max - min, 1);
  const points = values.map((value, index) => {
    const x = 6 + (index * (width - 12)) / (values.length - 1);
    const y = height - 8 - ((value - min) / span) * (height - 16);
    return { x, y };
  });
  const line = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const area = `${line} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`;
  const last = points[points.length - 1];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="mt-3 w-full h-12" aria-hidden="true">
      <path d={area} fill={fill} />
      <path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last.x} cy={last.y} r="3.5" fill={stroke} />
    </svg>
  );
}

export function HomeCashflowCard({
  range,
  incomes,
  expenses,
  periodIncome,
  periodSpent,
  balanceHeadline,
  onOpenIncomes,
  onOpenBalance,
}: {
  range: MonthRange;
  incomes: IncomeRow[];
  expenses: ExpenseRow[];
  periodIncome: number;
  periodSpent: number;
  balanceHeadline: string;
  onOpenIncomes: () => void;
  onOpenBalance: () => void;
}) {
  const incomeSeries = useMemo(
    () => downsample(cumulative(dailyIncomeAmounts(incomes, range))),
    [incomes, range],
  );
  const spendSeries = useMemo(
    () =>
      downsample(
        cumulative(dailySpendSeries(expenses, range).map((point) => point.amount)),
      ),
    [expenses, range],
  );

  return (
    <div
      className="rounded-[1.5rem] p-4"
      style={{ backgroundColor: P.card, boxShadow: HOME_CARD_SHADOW }}
    >
      <div className="mb-3 flex items-start justify-between gap-3 px-1">
        <div>
          <h3 className="text-xs font-semibold" style={{ color: P.text }}>
            Flujo del mes
          </h3>
          <p className="mt-1 text-[11px] leading-snug" style={{ color: P.muted }}>
            {balanceHeadline}
          </p>
        </div>
        <span className="text-[10px] font-medium" style={{ color: P.muted }}>
          {range.label}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onOpenIncomes}
          className="rounded-[1.15rem] p-3 text-left transition-transform active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{ backgroundColor: P.sub }}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: P.muted }}>
            Ingresos
          </p>
          <p className="mt-1 text-lg font-bold font-sans leading-none" style={{ color: P.text }}>
            {formatCompactMoney(periodIncome)}
          </p>
          <MiniSparkline
            values={incomeSeries}
            stroke={P.sage}
            fill="rgba(47,125,102,0.16)"
          />
        </button>

        <button
          type="button"
          onClick={onOpenBalance}
          className="rounded-[1.15rem] p-3 text-left transition-transform active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{ backgroundColor: P.sub }}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: P.muted }}>
            Gastado
          </p>
          <p className="mt-1 text-lg font-bold font-sans leading-none" style={{ color: P.text }}>
            {formatCompactMoney(periodSpent)}
          </p>
          <MiniSparkline
            values={spendSeries}
            stroke={P.brnDk}
            fill="rgba(216,141,154,0.18)"
          />
        </button>
      </div>

      <p className="mt-3 px-1 text-[11px]" style={{ color: P.muted }}>
        Neto del mes{" "}
        <span className="font-semibold font-sans" style={{ color: P.text }}>
          {formatExactMoney(periodIncome - periodSpent)}
        </span>
      </p>

      <button
        type="button"
        onClick={onOpenBalance}
        className="mt-3 w-full rounded-full py-3.5 text-center text-sm font-semibold transition-transform active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        style={{ backgroundColor: P.sub, color: P.text }}
      >
        Ver balance
      </button>
    </div>
  );
}
