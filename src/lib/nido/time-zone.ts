/** Fallback only when neither IP nor the device reports a zone. */
export const FALLBACK_TIME_ZONE = "America/Mexico_City";

export function isValidIanaTimeZone(value: string): boolean {
  const zone = value.trim();
  if (!zone || zone.length > 100) return false;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** OS timezone. Follows the device clock, including automatic location updates. */
export function detectDeviceTimeZone(): string | null {
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return timeZone && isValidIanaTimeZone(timeZone) ? timeZone : null;
  } catch {
    return null;
  }
}

function usableZone(value: string | null | undefined): string | null {
  if (!value) return null;
  const zone = value.trim();
  return isValidIanaTimeZone(zone) ? zone : null;
}

/**
 * Prefer the IP timezone (where the request is) over the device clock.
 * UTC from a network is treated as unknown so a real device zone can win.
 * America/Mexico_City is only the last resort.
 */
export function chooseTimeZone(input: {
  ipTimeZone?: string | null;
  deviceTimeZone?: string | null;
}): string {
  const ip = usableZone(input.ipTimeZone);
  const device = usableZone(input.deviceTimeZone);
  if (ip && ip !== "UTC") return ip;
  if (device) return device;
  if (ip) return ip;
  return FALLBACK_TIME_ZONE;
}
