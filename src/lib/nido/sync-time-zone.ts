import { nidoClient, requireUser } from "./session.ts";
import { setActiveTimeZone } from "./financial/dates.ts";
import { chooseTimeZone, detectDeviceTimeZone, FALLBACK_TIME_ZONE, isValidIanaTimeZone } from "./time-zone.ts";

export function resetTimeZone(): void {
  setActiveTimeZone(FALLBACK_TIME_ZONE);
}

async function fetchIpTimeZone(): Promise<string | null> {
  try {
    const response = await fetch("/api/timezone", {
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    if (!body || typeof body !== "object" || !("timeZone" in body)) return null;
    const timeZone = (body as { timeZone?: unknown }).timeZone;
    return typeof timeZone === "string" && isValidIanaTimeZone(timeZone) ? timeZone : null;
  } catch {
    return null;
  }
}

/** Detect IP or device timezone, apply it to date math, and store it on the profile. */
export async function syncDetectedTimeZone(): Promise<string> {
  const timeZone = chooseTimeZone({
    ipTimeZone: await fetchIpTimeZone(),
    deviceTimeZone: detectDeviceTimeZone(),
  });
  setActiveTimeZone(timeZone);

  const auth = await requireUser(nidoClient());
  if (auth.ok === false) return timeZone;

  const { error } = await auth.data.supabase
    .from("profiles")
    .update({ timezone: timeZone })
    .eq("id", auth.data.user.id);

  if (error) {
    console.error("Could not save timezone", error.message);
  }
  return timeZone;
}
