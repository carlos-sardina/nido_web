import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canShowInvitationQr,
  canUseWebShare,
  invitationDestination,
  invitationQrValue,
  isShareCancellation,
  shareInvitationPayload,
  shareInvitationUrl,
} from "./invitation-qr.ts";
import { buildInvitationUrl } from "./rules.ts";

const origin = "https://app.example.com";
const token = "owner-only-token-value";

describe("invitation destination is a single URL", () => {
  it("QR, Copy, and Share use buildInvitationUrl", () => {
    const url = invitationDestination(origin, token);
    assert.equal(url, buildInvitationUrl(origin, token));
    assert.equal(url, "https://app.example.com/join/owner-only-token-value");
    assert.equal(invitationQrValue(url), url);
    assert.deepEqual(shareInvitationPayload(url), { url });
    assert.equal("token" in shareInvitationPayload(url), false);
    assert.equal("household_id" in shareInvitationPayload(url), false);
    assert.equal("email" in shareInvitationPayload(url), false);
  });

  it("does not encode a token-only or short-code payload", () => {
    const url = invitationDestination(origin, token);
    assert.match(url, /\/join\//);
    assert.notEqual(invitationQrValue(url), token);
    assert.equal(JSON.stringify(shareInvitationPayload(url)), JSON.stringify({ url }));
  });
});

describe("canShowInvitationQr", () => {
  it("allows QR only for pending (valid) invitations", () => {
    assert.equal(canShowInvitationQr("pending"), true);
    assert.equal(canShowInvitationQr("accepted"), false);
    assert.equal(canShowInvitationQr("expired"), false);
  });
});

describe("Web Share", () => {
  it("is available only when navigator.share is a function", () => {
    assert.equal(canUseWebShare(undefined), false);
    assert.equal(canUseWebShare(null), false);
    assert.equal(canUseWebShare({}), false);
    assert.equal(
      canUseWebShare(async () => undefined),
      true,
    );
  });

  it("shares exactly the invitation URL", async () => {
    const url = invitationDestination(origin, token);
    const seen: unknown[] = [];
    const outcome = await shareInvitationUrl(url, async (data) => {
      seen.push(data);
    });
    assert.equal(outcome, "shared");
    assert.deepEqual(seen, [{ url }]);
  });

  it("treats user cancellation as cancelled, not a product error", async () => {
    const abort = new DOMException("Share canceled", "AbortError");
    const outcome = await shareInvitationUrl(
      invitationDestination(origin, token),
      async () => {
        throw abort;
      },
    );
    assert.equal(isShareCancellation(abort), true);
    assert.equal(outcome, "cancelled");
  });

  it("reports a real share failure", async () => {
    const outcome = await shareInvitationUrl(
      invitationDestination(origin, token),
      async () => {
        throw new Error("share failed");
      },
    );
    assert.equal(isShareCancellation(new Error("share failed")), false);
    assert.equal(outcome, "failed");
  });
});
