// ── HELPERS ──────────────────────────────────────────────────────────────────
export const $k  = (n: number) => n >= 1000 ? `$${(n/1000).toFixed(n%1000===0?0:1)}k` : `$${n.toLocaleString("es-MX")}`;
export const pct = (a: number, b: number) => (b > 0 ? Math.min(100, Math.round((a * 100) / b)) : 0);