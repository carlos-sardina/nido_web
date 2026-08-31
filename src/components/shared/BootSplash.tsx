import { cn } from "@/app/components/ui/utils";
import { Text } from "@/components/nido/Typography";
import { NidoHouse } from "@/components/shared/NidoHouse";

export function BootSplash({
  fading = false,
  caption,
  overlay = true,
}: {
  fading?: boolean;
  caption?: string;
  overlay?: boolean;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy={!fading}
      aria-label={caption ?? "Cargando"}
      className={cn(
        "flex items-center justify-center bg-card",
        overlay ? "fixed inset-0 z-50" : "min-h-dvh",
        "transition-[opacity,transform] duration-500 ease-out motion-reduce:transition-none",
        fading ? "pointer-events-none scale-[0.98] opacity-0" : "scale-100 opacity-100",
      )}
    >
      <div className="flex w-full max-w-md flex-col items-center px-6">
        <div
          className={cn(
            "w-full",
            !fading && "motion-safe:animate-nido-breathe",
          )}
        >
          <NidoHouse />
        </div>
        {caption ? (
          <Text size="body-sm" tone="muted" className="mt-6 text-center">
            {caption}
          </Text>
        ) : (
          <span className="sr-only">Cargando</span>
        )}
      </div>
    </div>
  );
}
