"use client";

import { BackLink, FlowScreen, ScreenIntro } from "@/components/nido/Screen";
import { Button } from "@/components/nido/Button";

export function ComingSoon({ onClose }: { onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-30">
      <FlowScreen className="h-full min-h-0">
        <BackLink onClick={onClose} label="Cerrar" />
        <ScreenIntro
          emoji="🌱"
          title="Próximamente"
          description="Esta función estará disponible próximamente."
        />
        <Button className="mt-8" onClick={onClose}>
          Volver
        </Button>
      </FlowScreen>
    </div>
  );
}
