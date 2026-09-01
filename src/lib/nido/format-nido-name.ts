/**
 * Home header label: "Nido Casa Roma".
 * Does not double-prefix if the household name already starts with "Nido".
 */
export function formatHomeNidoName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "";
  return /^nido\b/iu.test(trimmed) ? trimmed : `Nido ${trimmed}`;
}
