"use client";

import { P } from "@/lib/palette";
import { NidoHouse } from "@/components/shared/NidoHouse";
import { OBtn2 } from "@/components/onboarding/OBtn2";

export function NidoSelectionScreen({
  onCreate,
  onJoin,
}: {
  onCreate: () => void;
  onJoin: () => void;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 flex flex-col items-center justify-center">
        <NidoHouse />
        <div className="text-center mt-2 mb-8">
          <h1 className="text-3xl font-bold mb-2" style={{ fontFamily: "Fraunces, serif", color: P.text }}>
            Bienvenido a Nido 🪺
          </h1>
          <p className="text-sm leading-relaxed" style={{ color: P.muted }}>
            Para comenzar, crea tu Nido o únete a uno al que te hayan invitado.
          </p>
        </div>
      </div>
      <div className="space-y-3">
        <OBtn2 label="🪺 Crear un nuevo Nido" onClick={onCreate} />
        <OBtn2 label="👋 Unirme a un Nido" onClick={onJoin} variant="secondary" />
        <p className="text-center text-[11px] leading-relaxed pt-1" style={{ color: P.muted }}>
          Puedes hacerlo ahora o más tarde.
        </p>
      </div>
    </div>
  );
}
