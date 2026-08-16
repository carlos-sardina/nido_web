/**
 * Confirmation-email resend cooldown.
 *
 * Success copy never reveals whether the address exists. Cooldown is a UX
 * guard against accidental repeats, not a security control. Auth remains
 * the authority for rate limits.
 */

export const RESEND_COOLDOWN_MS = 60_000;

export function resendCooldownRemaining(lastRequestedAt: number | null, now: number): number {
  if (lastRequestedAt == null) return 0;
  return Math.max(0, RESEND_COOLDOWN_MS - (now - lastRequestedAt));
}

export function canResendConfirmation(lastRequestedAt: number | null, now: number): boolean {
  return resendCooldownRemaining(lastRequestedAt, now) === 0;
}
