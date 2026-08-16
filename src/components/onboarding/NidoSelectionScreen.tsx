"use client";

import { P } from "@/lib/palette";
import { NidoHouse } from "@/components/shared/NidoHouse";

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
            Nido funciona alrededor de los hogares y comunidades que compartes.
          </p>
        </div>
      </div>
      <div className="space-y-3">
        <button
          type="button"
          onClick={onCreate}
          className="w-full flex items-center gap-3 p-4 rounded-2xl border text-left"
          style={{ borderColor: P.border, backgroundColor: P.card }}
        >
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg" style={{ backgroundColor: P.sagePl }}>
            🪺
          </div>
          <div>
            <p className="text-xs font-semibold" style={{ color: P.text }}>Crear un nuevo Nido</p>
            <p className="text-[10px]" style={{ color: P.muted }}>Empieza uno desde cero.</p>
          </div>
        </button>
        <button
          type="button"
          onClick={onJoin}
          className="w-full flex items-center gap-3 p-4 rounded-2xl border text-left"
          style={{ borderColor: P.border, backgroundColor: P.card }}
        >
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg" style={{ backgroundColor: P.sagePl }}>
            👋
          </div>
          <div>
            <p className="text-xs font-semibold" style={{ color: P.text }}>Unirme a un Nido</p>
            <p className="text-[10px]" style={{ color: P.muted }}>¿Ya te invitaron? Únete con tu enlace.</p>
          </div>
        </button>
        <p className="text-center text-[11px] leading-relaxed pt-1" style={{ color: P.muted }}>
          Puedes pertenecer a un Nido a la vez.
        </p>
      </div>
    </div>
  );
}
