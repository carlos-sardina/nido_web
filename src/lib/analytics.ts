import { track } from "@vercel/analytics";
import { identityFromUser } from "@/lib/auth/identity";
import { createClient } from "@/lib/supabase/client";

type AnalyticsProps = Record<string, string | number | boolean | null>;

const MAX_PROP = 255;

let rememberedEmail: string | null = null;
let rememberedUsername: string | null = null;

function clip(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  return trimmed.length > MAX_PROP ? trimmed.slice(0, MAX_PROP) : trimmed;
}

function stringProp(value: unknown): string | null {
  return typeof value === "string" ? clip(value) : null;
}

export function rememberAnalyticsActor(actor: {
  email?: string | null;
  username?: string | null;
}): void {
  const email = clip(actor.email);
  const username = clip(actor.username);
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
      email: clip(identity?.email),
      username: clip(identity?.displayName),
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
}
