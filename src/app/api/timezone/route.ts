import { NextResponse } from "next/server";
import { isValidIanaTimeZone } from "@/lib/nido/time-zone";

export const dynamic = "force-dynamic";

/**
 * Timezone of this request from the hosting provider's IP geolocation.
 * Vercel sends `x-vercel-ip-timezone` (IANA name, for example Asia/Tokyo).
 */
export function GET(request: Request) {
  const fromIp = request.headers.get("x-vercel-ip-timezone");
  const timeZone = fromIp && isValidIanaTimeZone(fromIp) ? fromIp : null;
  return NextResponse.json({ timeZone });
}
