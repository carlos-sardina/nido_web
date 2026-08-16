"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

/**
 * Restores the Supabase session and stays in sync with auth changes.
 *
 * Used once at the app root. Do not call this hook in multiple trees —
 * that would create duplicate `onAuthStateChange` subscriptions.
 */
export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    let supabase: ReturnType<typeof createClient>;
    try {
      supabase = createClient();
    } catch (error) {
      console.error("Supabase is not configured", error);
      setUser(null);
      setIsLoading(false);
      return;
    }

    supabase.auth.getUser().then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        console.error("Failed to restore auth session", error);
        setUser(null);
      } else {
        setUser(data.user);
      }
      setIsLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  return { user, isLoading };
}
