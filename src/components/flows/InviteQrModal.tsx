import { QrCode, X } from "lucide-react";
import { P } from "@/lib/palette";
import { PBtn } from "@/components/shared/PBtn";

export function InviteQrModal({ inviteUrl, nestName, onClose }: { inviteUrl: string; nestName: string; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-50" style={{ backgroundColor: "rgba(47,42,40,0.40)" }} onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 rounded-t-[2rem] pt-3 pb-8" style={{ backgroundColor: P.card }}>
        <div className="w-10 h-1 rounded-full mx-auto mb-5" style={{ backgroundColor: P.sub }} />
        <div className="px-6">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-lg font-bold" style={{ fontFamily: "Fraunces, serif", color: P.text }}>Invitar por QR</h3>
            <button onClick={onClose} className="w-9 h-9 rounded-full flex items-center justify-center" style={{ backgroundColor: P.sub }}>
              <X size={16} style={{ color: P.text }} />
            </button>
          </div>
          <p className="text-xs mb-5" style={{ color: P.muted }}>
            Escanea para unirse a {nestName || "tu Nido"}
          </p>
          <div className="flex justify-center mb-5">
            <div className="p-4 rounded-2xl border-2" style={{ backgroundColor: "#FFFFFF", borderColor: "rgba(47,42,40,0.12)" }}>
              <QrCode size={160} strokeWidth={1.25} style={{ color: P.text }} />
            </div>
          </div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-center mb-1.5" style={{ color: P.muted }}>
            Enlace de invitación
          </p>
          <p className="text-xs text-center font-medium break-all mb-5 px-2" style={{ color: P.text }}>
            {inviteUrl}
          </p>
          <PBtn label="Cerrar" onClick={onClose} variant="ghost" />
        </div>
      </div>
    </>
  );
}
