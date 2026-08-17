"use client";

import { ChoiceCard } from "@/components/nido/ChoiceCard";
import { TextLink } from "@/components/nido/TextLink";
import { ScreenIntro } from "@/components/nido/Screen";
import { Text } from "@/components/nido/Typography";
import { NidoHouse } from "@/components/shared/NidoHouse";

export function NidoSelectionScreen({
  onCreate,
  onJoin,
  onLogout,
}: {
  onCreate: () => void;
  onJoin: () => void;
  onLogout?: () => void;
}) {
  return (
    <div className="flex flex-col flex-1">
      <div className="flex-1 flex flex-col items-center justify-center">
        <NidoHouse />
        <ScreenIntro
          className="mt-6"
          align="center"
          title="Bienvenido a Nido 🪺"
          description="Nido funciona alrededor de los hogares y comunidades que compartes."
        />
      </div>
      <div className="space-y-3 mt-8">
        <ChoiceCard
          icon="🪺"
          title="Crear un nuevo Nido"
          description="Empieza uno desde cero."
          onClick={onCreate}
        />
        <ChoiceCard
          icon="👋"
          title="Unirme a un Nido"
          description="¿Ya te invitaron? Únete con tu enlace."
          onClick={onJoin}
        />
        <Text size="caption" tone="muted" className="text-center leading-relaxed pt-1">
          Puedes pertenecer a un Nido a la vez.
        </Text>
        {onLogout && (
          <div className="flex justify-center">
            <TextLink tone="muted" onClick={onLogout}>
              Cerrar sesión
            </TextLink>
          </div>
        )}
      </div>
    </div>
  );
}
