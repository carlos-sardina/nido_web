import { QrCode, X } from "lucide-react";
import { P } from "@/lib/palette";
import { Button } from "@/components/nido/Button";
import { SectionLabel } from "@/components/nido/ChoiceCard";
import { Heading, Text } from "@/components/nido/Typography";

export function InviteQrModal({ inviteUrl, nestName, onClose }: { inviteUrl: string; nestName: string; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-50" style={{ backgroundColor: "rgba(47,42,40,0.40)" }} onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 rounded-t-[2rem] pt-3 pb-8 font-sans" style={{ backgroundColor: P.card }}>
        <div className="w-10 h-1 rounded-full mx-auto mb-5" style={{ backgroundColor: P.sub }} />
        <div className="mx-auto w-full max-w-md px-6">
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
            Escanea para unirse a {nestName || "tu Nido"}
          </Text>
          <div className="flex justify-center mb-6">
            <div className="p-4 rounded-2xl border-2" style={{ backgroundColor: "#FFFFFF", borderColor: P.sub }}>
              <QrCode size={160} strokeWidth={1.25} style={{ color: P.text }} />
            </div>
          </div>
          <SectionLabel>Enlace de invitación</SectionLabel>
          <Text size="caption" className="text-center font-medium break-all mb-6 px-2">
            {inviteUrl}
          </Text>
          <Button
            onClick={() => {
              void navigator.clipboard.writeText(inviteUrl);
            }}
          >
            Copiar enlace
          </Button>
          <div className="h-3" />
          <Button variant="ghost" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </div>
    </>
  );
}
