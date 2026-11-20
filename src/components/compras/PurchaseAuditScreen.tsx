"use client";

import { PurchaseAuditTimeline } from "@/components/compras/PurchaseAuditTimeline";
import { BackLink } from "@/components/nido/Screen";
import { Heading, Text } from "@/components/nido/Typography";
import { P } from "@/lib/palette";

export function PurchaseAuditScreen({
  householdId,
  refreshKey = 0,
  onClose,
  onSelectPurchase,
}: {
  householdId: string;
  refreshKey?: number;
  onClose: () => void;
  onSelectPurchase?: (purchaseId: string) => void;
}) {
  return (
    <div className="absolute inset-0 z-40 flex flex-col" style={{ backgroundColor: P.bgL }}>
      <div className="px-6 pt-[max(1rem,env(safe-area-inset-top))] pb-28 overflow-y-auto overscroll-contain [&::-webkit-scrollbar]:hidden">
        <BackLink onClick={onClose} label="Cerrar" />
        <Heading as="h2" size="h2" className="mt-3">
          Historial
        </Heading>
        <Text size="caption" tone="muted" className="mt-1">
          Solo lectura: altas, pagos, deshacer, bonos, cuotas y cambios del módulo. No se borra al
          deshacer.
        </Text>

        <PurchaseAuditTimeline
          householdId={householdId}
          refreshKey={refreshKey}
          pageSize={20}
          showHeading={false}
          emptyLabel="Cuando registres pagos o cambios, quedarán aquí para auditar."
          onSelectPurchase={onSelectPurchase}
        />
      </div>
    </div>
  );
}
