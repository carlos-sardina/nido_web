import { NextResponse } from "next/server";
import { logAnalyticsEvent, parseAnalyticsLogBody } from "@/lib/analytics-log";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return new NextResponse(null, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  const parsed = parseAnalyticsLogBody(body);
  if (!parsed) {
    return new NextResponse(null, { status: 400 });
  }

  logAnalyticsEvent(parsed.name, parsed.props);
  return new NextResponse(null, { status: 204 });
}
