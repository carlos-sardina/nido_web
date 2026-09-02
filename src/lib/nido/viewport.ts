export const APP_HEIGHT_VAR = "--app-height";
export const APP_OFFSET_TOP_VAR = "--app-offset-top";
export const APP_KEYBOARD_CLASS = "nido-keyboard-open";
export const KEYBOARD_HEIGHT_THRESHOLD_PX = 150;

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

export function isSoftKeyboardOpen(input: {
  visualHeight: number;
  layoutHeight: number;
  restingVisualHeight?: number;
  threshold?: number;
}): boolean {
  const threshold = input.threshold ?? KEYBOARD_HEIGHT_THRESHOLD_PX;
  if (input.layoutHeight - input.visualHeight >= threshold) return true;
  if (
    input.restingVisualHeight != null
    && input.restingVisualHeight - input.visualHeight >= threshold
  ) {
    return true;
  }
  return false;
}

export function resolveShellOffsetTop(
  viewport: Pick<VisualViewportMetrics, "offsetTop" | "scale">,
  keyboardOpen = false,
): number {
  return keyboardOpen || isViewportZoomed(viewport.scale) ? viewport.offsetTop : 0;
}

export function applyKeyboardOpenState(
  root: { classList: { toggle(token: string, force?: boolean): boolean } },
  open: boolean,
): void {
  root.classList.toggle(APP_KEYBOARD_CLASS, open);
}

export function shouldPreventPinchZoom(touchCount: number): boolean {
  return touchCount > 1;
}
