import { buildInvitationUrl } from "./rules.ts";
import type { InvitationListStatus } from "./types.ts";

export type InvitationSharePayload = {
  url: string;
};

export type ShareInvitationOutcome = "shared" | "cancelled" | "failed";

/**
 * QR is only for unused, unexpired invitations.
 * List status already maps classifyInvitation `valid` → `pending`.
 */
export function canShowInvitationQr(status: InvitationListStatus): boolean {
  return status === "pending";
}

/** QR, Copy, and Share all encode this same destination. */
export function invitationDestination(origin: string, token: string): string {
  return buildInvitationUrl(origin, token);
}

/** The QR payload is the invitation URL as-is. Never a token, JSON, or short code. */
export function invitationQrValue(inviteUrl: string): string {
  return inviteUrl;
}

export function shareInvitationPayload(inviteUrl: string): InvitationSharePayload {
  return { url: inviteUrl };
}

export function canUseWebShare(share: unknown): boolean {
  return typeof share === "function";
}

export function isShareCancellation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String((error as { name?: unknown }).name) : "";
  return name === "AbortError";
}

export async function shareInvitationUrl(
  inviteUrl: string,
  share: (data: InvitationSharePayload) => Promise<void>,
): Promise<ShareInvitationOutcome> {
  try {
    await share(shareInvitationPayload(inviteUrl));
    return "shared";
  } catch (error) {
    if (isShareCancellation(error)) return "cancelled";
    return "failed";
  }
}
