export const APP_HEIGHT_VAR = "--app-height";
export const APP_OFFSET_TOP_VAR = "--app-offset-top";

export type VisualViewportMetrics = {
  height: number;
  offsetTop: number;
  scale: number;
};

export function readAppViewport(
  visual: Partial<VisualViewportMetrics> | null | undefined,
  fallbackHeight: number,
): VisualViewportMetrics {
  const height = visual?.height && visual.height > 0 ? visual.height : fallbackHeight;
  const offsetTop = Number.isFinite(visual?.offsetTop) ? Number(visual?.offsetTop) : 0;
  const scale = visual?.scale && visual.scale > 0 ? visual.scale : 1;
  return {
    height: Math.max(0, height),
    offsetTop: Math.max(0, offsetTop),
    scale,
  };
}

export function applyAppViewport(
  root: { style: { setProperty(name: string, value: string): void } },
  viewport: Pick<VisualViewportMetrics, "height" | "offsetTop">,
): void {
  root.style.setProperty(APP_HEIGHT_VAR, `${viewport.height}px`);
  root.style.setProperty(APP_OFFSET_TOP_VAR, `${viewport.offsetTop}px`);
}

export function isViewportZoomed(scale: number, epsilon = 0.01): boolean {
  return Math.abs(scale - 1) > epsilon;
}

export function shouldPreventPinchZoom(touchCount: number): boolean {
  return touchCount > 1;
}
