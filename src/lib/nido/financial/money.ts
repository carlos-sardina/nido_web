/**
 * Money helpers for derived financial values.
 *
 * Postgres `numeric(12,2)` may arrive as a number or a string. Never use
 * float-unaware `+` across a list without rounding to cents.
 */

export const MONEY_CENTS = 100;
export const MAX_MONEY_AMOUNT = 9_999_999_999.99;

export function parseMoney(value: unknown): number | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return roundMoney(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || /[eE]|inf|nan/i.test(trimmed)) return null;
    if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return null;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return null;
    return roundMoney(parsed);
  }
  return null;
}

export function moneyOrZero(value: unknown): number {
  return parseMoney(value) ?? 0;
}

export function roundMoney(value: number): number {
  return Math.round(value * MONEY_CENTS) / MONEY_CENTS;
}

export function sumMoney(values: Iterable<unknown>): number {
  let cents = 0;
  for (const value of values) {
    const parsed = parseMoney(value);
    if (parsed == null) continue;
    cents += Math.round(parsed * MONEY_CENTS);
  }
  return cents / MONEY_CENTS;
}

/** 0–100 for progress bars. Invalid or non-positive totals yield 0, never NaN. */
export function clampedPercent(part: number, total: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((part * 100) / total)));
}

/** Unbounded percent for copy such as "105% del presupuesto". Null if invalid. */
export function ratioPercent(part: number, total: number): number | null {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return null;
  return Math.round((part * 100) / total);
}

export function goalProgressRatio(contributed: number, target: number): number {
  if (!Number.isFinite(contributed) || !Number.isFinite(target) || target <= 0) return 0;
  if (contributed <= 0) return 0;
  return Math.min(1, contributed / target);
}

/** Compact dashboard amounts: $35.4k / $700. Figtree, not Fraunces. */
export function formatCompactMoney(amount: number): string {
  const value = Number.isFinite(amount) ? amount : 0;
  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  if (abs >= 1000) {
    const thousands = abs / 1000;
    const decimals = abs % 1000 === 0 ? 0 : 1;
    return `${sign}$${thousands.toFixed(decimals)}k`;
  }
  return `${sign}$${abs.toLocaleString("es-MX")}`;
}

/** Full currency for featured amounts: $120,000 */
export function formatWholeMoney(amount: number): string {
  const value = Number.isFinite(amount) ? Math.round(amount) : 0;
  const sign = value < 0 ? "−" : "";
  return `${sign}$${Math.abs(value).toLocaleString("es-MX")}`;
}
