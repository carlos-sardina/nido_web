"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { X } from "lucide-react";
import { canSubmitInvitationAction } from "@/lib/nido/invitation-actions";
import {
  canUseWebShare,
  invitationQrValue,
  shareInvitationUrl,
} from "@/lib/nido/invitation-qr";
import { P } from "@/lib/palette";
import { Button } from "@/components/nido/Button";
import { Heading, Text } from "@/components/nido/Typography";

export function InviteQrModal({
  inviteUrl,
  nestName,
  onClose,
}: {
  inviteUrl: string;
  nestName: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareAvailable, setShareAvailable] = useState(false);

  useEffect(() => {
    setShareAvailable(canUseWebShare(navigator.share));
  }, []);

  const handleCopy = async () => {
    setCopyError(null);
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
    } catch {
      setCopied(false);
      setCopyError("No se pudo copiar el enlace.");
    }
  };

  const handleShare = async () => {
    if (!canSubmitInvitationAction(sharing)) return;
    if (!canUseWebShare(navigator.share)) return;
    setSharing(true);
    setShareError(null);
    const outcome = await shareInvitationUrl(inviteUrl, (data) => navigator.share(data));
    setSharing(false);
    if (outcome === "failed") {
      setShareError("No se pudo compartir el enlace.");
    }
  };

  const nestLabel = nestName || "tu Nido";

  return (
    <>
      <div className="fixed inset-0 z-50" style={{ backgroundColor: "rgba(47,42,40,0.40)" }} onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 rounded-t-[2rem] pt-3 pb-[max(2rem,env(safe-area-inset-bottom))] font-sans" style={{ backgroundColor: P.card }}>
        <div className="w-10 h-1 rounded-full mx-auto mb-5" style={{ backgroundColor: P.sub }} />
        <div className="w-full px-6">
          <div className="flex items-center justify-between mb-2">
            <Heading as="h3" size="h3">Invitar por QR</Heading>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="w-11 h-11 rounded-full flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              style={{ backgroundColor: P.sub }}
            >
              <X size={16} style={{ color: P.text }} />
            </button>
          </div>
          <Text size="body-sm" tone="muted" className="mb-6">
            Escanea para unirse a {nestLabel}
          </Text>
          <div className="flex justify-center mb-6">
            <div
              className="p-4 rounded-2xl border-2"
              style={{ backgroundColor: "#FFFFFF", borderColor: P.sub }}
            >
              <QRCodeSVG
                value={invitationQrValue(inviteUrl)}
                size={176}
                level="M"
                marginSize={4}
                bgColor="#FFFFFF"
                fgColor="#1A1716"
                title={`Código QR para unirse a ${nestLabel}`}
              />
            </div>
          </div>
          {copyError && (
            <Text size="caption" tone="danger" role="alert" className="mb-3">
              {copyError}
            </Text>
          )}
          {shareError && (
            <Text size="caption" tone="danger" role="alert" className="mb-3">
              {shareError}
            </Text>
          )}
          <Button onClick={() => { void handleCopy(); }}>
            {copied ? "Enlace copiado" : "Copiar enlace"}
          </Button>
          {shareAvailable && (
            <>
              <div className="h-3" />
              <Button
                variant="secondary"
                loading={sharing}
                disabled={!canSubmitInvitationAction(sharing)}
                onClick={() => { void handleShare(); }}
              >
                {sharing ? "Compartiendo…" : "Compartir enlace"}
              </Button>
            </>
          )}
          <div className="h-3" />
          <Button variant="ghost" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </div>
    </>
  );
}
