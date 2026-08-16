/**
 * Frontend UX cooldown for auth emails (confirmation resend, recovery).
 *
 * This is not a security control. Supabase Auth and SMTP remain the real
 * rate limiters. sessionStorage holds only action, normalized email, and a
 * timestamp — never passwords or tokens.
 */

import type { AuthFailureCode } from "./errors";

export const EMAIL_COOLDOWN_SECONDS = 60;
export const EMAIL_COOLDOWN_MS = EMAIL_COOLDOWN_SECONDS * 1_000;
export const EMAIL_COOLDOWN_STORAGE_KEY = "nido.emailCooldown";

export type EmailCooldownAction = "confirmation" | "recovery";

export type EmailCooldownRecord = {
  action: EmailCooldownAction;
  email: string;
  sentAt: number;
};

const ACTIONS = new Set<EmailCooldownAction>(["confirmation", "recovery"]);
const SECRET_KEYS = /password|passwd|secret|token|refresh|access_token|api[_-]?key/i;
const ALLOWED_RECORD_KEYS = new Set(["action", "email", "sentAt"]);

type EmailCooldownStore = Record<string, EmailCooldownRecord>;

function normalizeCooldownEmail(email: string): string {
  return email.trim().toLowerCase();
}

function getSessionStorage(): Storage | null {
  try {
    if (typeof sessionStorage === "undefined") return null;
    return sessionStorage;
  } catch {
    return null;
  }
}

export function emailCooldownStorageKey(action: EmailCooldownAction, email: string): string {
  return `${action}:${normalizeCooldownEmail(email)}`;
}

function remainingSecondsFrom(sentAt: number, now: number): number {
  if (!Number.isFinite(sentAt) || !Number.isFinite(now)) return 0;
  return Math.max(
    0,
    Math.min(EMAIL_COOLDOWN_SECONDS, EMAIL_COOLDOWN_SECONDS - Math.floor((now - sentAt) / 1000)),
  );
}

function isSafeRecord(value: unknown): value is EmailCooldownRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (SECRET_KEYS.test(key)) return false;
    if (!ALLOWED_RECORD_KEYS.has(key)) return false;
  }
  const action = record.action;
  const email = record.email;
  const sentAt = record.sentAt;
  if (typeof action !== "string" || !ACTIONS.has(action as EmailCooldownAction)) return false;
  if (typeof email !== "string" || !normalizeCooldownEmail(email)) return false;
  if (typeof sentAt !== "number" || !Number.isFinite(sentAt)) return false;
  return true;
}

function sanitizeStore(value: unknown, now: number): { store: EmailCooldownStore; dirty: boolean } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { store: {}, dirty: value != null };
  }

  const store: EmailCooldownStore = {};
  let dirty = false;

  for (const [key, record] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEYS.test(key) || !isSafeRecord(record)) {
      dirty = true;
      continue;
    }
    const email = normalizeCooldownEmail(record.email);
    const canonicalKey = emailCooldownStorageKey(record.action, email);
    if (key !== canonicalKey) dirty = true;
    if (remainingSecondsFrom(record.sentAt, now) <= 0) {
      dirty = true;
      continue;
    }
    store[canonicalKey] = {
      action: record.action,
      email,
      sentAt: record.sentAt,
    };
  }

  return { store, dirty };
}

function persistStore(store: EmailCooldownStore) {
  const storage = getSessionStorage();
  if (!storage) return;
  if (Object.keys(store).length === 0) {
    storage.removeItem(EMAIL_COOLDOWN_STORAGE_KEY);
    return;
  }
  storage.setItem(EMAIL_COOLDOWN_STORAGE_KEY, JSON.stringify(store));
}

function readStore(now: number): EmailCooldownStore {
  const storage = getSessionStorage();
  if (!storage) return {};

  const raw = storage.getItem(EMAIL_COOLDOWN_STORAGE_KEY);
  if (!raw) return {};

  try {
    const { store, dirty } = sanitizeStore(JSON.parse(raw), now);
    if (dirty) persistStore(store);
    return store;
  } catch {
    storage.removeItem(EMAIL_COOLDOWN_STORAGE_KEY);
    return {};
  }
}

export function getRemainingCooldown(
  action: EmailCooldownAction,
  email: string,
  now = Date.now(),
): number {
  const normalized = normalizeCooldownEmail(email);
  if (!normalized) return 0;
  const record = readStore(now)[emailCooldownStorageKey(action, normalized)];
  if (!record) return 0;
  return remainingSecondsFrom(record.sentAt, now);
}

export function isCoolingDown(
  action: EmailCooldownAction,
  email: string,
  now = Date.now(),
): boolean {
  return getRemainingCooldown(action, email, now) > 0;
}

export function startCooldown(
  action: EmailCooldownAction,
  email: string,
  now = Date.now(),
): void {
  const normalized = normalizeCooldownEmail(email);
  if (!normalized || !ACTIONS.has(action)) return;
  const store = readStore(now);
  store[emailCooldownStorageKey(action, normalized)] = {
    action,
    email: normalized,
    sentAt: now,
  };
  persistStore(store);
}

export function clearCooldown(
  action: EmailCooldownAction,
  email: string,
  now = Date.now(),
): void {
  const normalized = normalizeCooldownEmail(email);
  if (!normalized) return;
  const store = readStore(now);
  const key = emailCooldownStorageKey(action, normalized);
  if (!(key in store)) return;
  delete store[key];
  persistStore(store);
}

/**
 * Rate-limit and network failures must not start a fake 60s UX cooldown.
 * Success and enumeration-safe accepted responses should.
 */
export function shouldStartEmailCooldown(failureCode: AuthFailureCode | null | undefined): boolean {
  return failureCode !== "rate_limit" && failureCode !== "network";
}

/**
 * Guard against double submit (in-flight request) and an active UX cooldown.
 * Reads sessionStorage; does not trust React state.
 */
export function canAttemptEmailSend(
  action: EmailCooldownAction,
  email: string,
  input: { inFlight: boolean; now?: number },
): boolean {
  if (input.inFlight) return false;
  if (!normalizeCooldownEmail(email)) return false;
  return !isCoolingDown(action, email, input.now);
}

export function emailCooldownCountdownLabel(verb: string, remainingSeconds: number): string {
  return `${verb} en ${remainingSeconds} s`;
}

export function emailCooldownRetryHint(remainingSeconds: number): string {
  return `Podrás solicitar otro en ${remainingSeconds} s.`;
}

export function readEmailCooldownStorage(now = Date.now()): EmailCooldownRecord[] {
  return Object.values(readStore(now));
}
