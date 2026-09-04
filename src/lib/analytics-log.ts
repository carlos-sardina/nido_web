export const ANALYTICS_LOG_PREFIX = "[nido:event]";

export type AnalyticsProps = Record<string, string | number | boolean | null>;

const MAX_PROP = 255;
const MAX_PROPS = 20;

export function clipAnalyticsValue(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  return trimmed.length > MAX_PROP ? trimmed.slice(0, MAX_PROP) : trimmed;
}

function sanitizePropValue(value: unknown): string | number | boolean | null | undefined {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") return clipAnalyticsValue(value);
  return undefined;
}

export function sanitizeAnalyticsProps(value: unknown): AnalyticsProps {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const props: AnalyticsProps = {};
  for (const [key, raw] of Object.entries(value)) {
    const clippedKey = clipAnalyticsValue(key);
    const sanitized = sanitizePropValue(raw);
    if (!clippedKey || sanitized === undefined) continue;
    props[clippedKey] = sanitized;
    if (Object.keys(props).length >= MAX_PROPS) break;
  }
  return props;
}

export function parseAnalyticsLogBody(value: unknown): { name: string; props: AnalyticsProps } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const name = clipAnalyticsValue((value as { name?: unknown }).name as string | undefined);
  if (!name) return null;
  return {
    name,
    props: sanitizeAnalyticsProps((value as { props?: unknown }).props),
  };
}

export function formatAnalyticsLog(name: string, props?: AnalyticsProps): string {
  return `${ANALYTICS_LOG_PREFIX} ${JSON.stringify({ event: name, ...props })}`;
}

export function logAnalyticsEvent(name: string, props?: AnalyticsProps): void {
  console.log(formatAnalyticsLog(name, props));
}
