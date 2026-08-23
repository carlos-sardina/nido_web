export const PULL_REFRESH_THRESHOLD_PX = 72;
export const PULL_REFRESH_RESISTANCE = 0.55;

export type PullRefreshPhase = "idle" | "pulling" | "armed" | "refreshing";

export function isAtScrollStart(scrollTop: number): boolean {
  return scrollTop === 0;
}

export function canBeginPull(input: {
  scrollTop: number;
  refreshing: boolean;
}): boolean {
  return isAtScrollStart(input.scrollTop) && !input.refreshing;
}

export function applyPullResistance(
  deltaY: number,
  resistance = PULL_REFRESH_RESISTANCE,
): number {
  if (deltaY <= 0) return 0;
  return deltaY * resistance;
}

export function pullProgress(
  pullDistance: number,
  threshold = PULL_REFRESH_THRESHOLD_PX,
): number {
  if (threshold <= 0 || pullDistance <= 0) return 0;
  return Math.min(1, pullDistance / threshold);
}

export function isArmed(
  pullDistance: number,
  threshold = PULL_REFRESH_THRESHOLD_PX,
): boolean {
  return pullDistance >= threshold;
}

export function shouldTriggerRefresh(input: {
  scrollTop: number;
  pullDistance: number;
  refreshing: boolean;
  threshold?: number;
}): boolean {
  if (input.refreshing) return false;
  if (!isAtScrollStart(input.scrollTop)) return false;
  return isArmed(input.pullDistance, input.threshold ?? PULL_REFRESH_THRESHOLD_PX);
}

export function nextPullPhase(input: {
  refreshing: boolean;
  tracking: boolean;
  pullDistance: number;
  threshold?: number;
}): PullRefreshPhase {
  if (input.refreshing) return "refreshing";
  if (!input.tracking || input.pullDistance <= 0) return "idle";
  return isArmed(input.pullDistance, input.threshold) ? "armed" : "pulling";
}

export function shouldAcceptRefresh(refreshing: boolean): boolean {
  return !refreshing;
}
