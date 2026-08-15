// ── HELPERS ──────────────────────────────────────────────────────────────────
export const $k  = (n: number) => n >= 1000 ? `$${(n/1000).toFixed(n%1000===0?0:1)}k` : `$${n.toLocaleString("es-MX")}`;
export const pct = (a: number, b: number) => Math.min(100, Math.round((a/b)*100));