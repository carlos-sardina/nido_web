import { track } from "@vercel/analytics";
import { clipAnalyticsValue, type AnalyticsProps } from "@/lib/analytics-log";
import { identityFromUser } from "@/lib/auth/identity";
import { createClient } from "@/lib/supabase/client";

let rememberedEmail: string | null = null;
let rememberedUsername: string | null = null;

function stringProp(value: unknown): string | null {
  return typeof value === "string" ? clipAnalyticsValue(value) : null;
}

export function rememberAnalyticsActor(actor: {
  email?: string | null;
  username?: string | null;
}): void {
  const email = clipAnalyticsValue(actor.email);
  const username = clipAnalyticsValue(actor.username);
  if (email) rememberedEmail = email;
  if (username) rememberedUsername = username;
}

export function clearAnalyticsActor(): void {
  rememberedEmail = null;
  rememberedUsername = null;
}

async function sessionActor(): Promise<{ email: string | null; username: string | null }> {
  try {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    const identity = identityFromUser(data.session?.user);
    return {
      email: clipAnalyticsValue(identity?.email),
      username: clipAnalyticsValue(identity?.displayName),
    };
  } catch {
    return { email: null, username: null };
  }
}

/**
 * Client-side custom events for Vercel Web Analytics.
 * Always attaches `email` and `username` when known so beta usage is identifiable.
 */
export function trackEvent(name: string, props?: AnalyticsProps): void {
  void emitEvent(name, props);
}

async function emitEvent(name: string, props?: AnalyticsProps): Promise<void> {
  const session = await sessionActor();
  const email = stringProp(props?.email) ?? rememberedEmail ?? session.email;
  const username = stringProp(props?.username) ?? rememberedUsername ?? session.username;
  const payload: AnalyticsProps = { ...props };
  if (email) payload.email = email;
  if (username) payload.username = username;
  track(name, payload);
  postAnalyticsLog(name, payload);
}

function postAnalyticsLog(name: string, props: AnalyticsProps): void {
  if (typeof window === "undefined") return;
  try {
    void fetch("/api/analytics", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, props }),
      keepalive: true,
    });
  } catch {
    // Logging must never break the app.
  }
}
