import { clipAnalyticsValue, type AnalyticsProps } from "./analytics-log.ts";

export type AnalyticsDeviceInput = {
  userAgent: string;
  maxTouchPoints: number;
  width: number;
  height: number;
  standalone: boolean;
  language: string;
  path: string;
};

function includes(ua: string, token: string): boolean {
  return ua.toLowerCase().includes(token);
}

export function analyticsOs(userAgent: string): string {
  const ua = userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua) || (includes(ua, "mac os") && ua.includes("mobile"))) return "ios";
  if (includes(ua, "android")) return "android";
  if (includes(ua, "windows")) return "windows";
  if (includes(ua, "mac os")) return "macos";
  if (includes(ua, "linux")) return "linux";
  return "other";
}

export function analyticsBrowser(userAgent: string): string {
  const ua = userAgent.toLowerCase();
  if (includes(ua, "edg/")) return "edge";
  if (includes(ua, "opr/") || includes(ua, "opera")) return "opera";
  if (includes(ua, "firefox/") || includes(ua, "fxios/")) return "firefox";
  if (includes(ua, "chrome/") || includes(ua, "crios/")) return "chrome";
  if (includes(ua, "safari/")) return "safari";
  return "other";
}

export function analyticsDevice(input: Pick<AnalyticsDeviceInput, "userAgent" | "maxTouchPoints" | "width">): string {
  const ua = input.userAgent.toLowerCase();
  if (includes(ua, "ipad") || (includes(ua, "macintosh") && input.maxTouchPoints > 1)) return "tablet";
  if (includes(ua, "iphone") || includes(ua, "ipod") || (includes(ua, "android") && includes(ua, "mobile"))) {
    return "mobile";
  }
  if (includes(ua, "android") || (input.maxTouchPoints > 0 && input.width >= 768 && input.width <= 1280)) {
    return "tablet";
  }
  if (includes(ua, "mobile") || input.width < 768) return "mobile";
  return "desktop";
}

export function analyticsClientContext(input: AnalyticsDeviceInput): AnalyticsProps {
  const width = Math.round(input.width);
  const height = Math.round(input.height);
  return {
    path: clipAnalyticsValue(input.path) ?? "/",
    standalone: input.standalone,
    device: analyticsDevice(input),
    os: analyticsOs(input.userAgent),
    browser: analyticsBrowser(input.userAgent),
    language: clipAnalyticsValue(input.language.split(",")[0] ?? input.language) ?? "unknown",
    viewport: clipAnalyticsValue(`${width}x${height}`) ?? null,
  };
}

export function readAnalyticsClientContext(): AnalyticsProps {
  if (typeof window === "undefined") return {};
  return analyticsClientContext({
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    width: window.innerWidth,
    height: window.innerHeight,
    standalone: window.matchMedia("(display-mode: standalone)").matches,
    language: navigator.language || navigator.languages?.[0] || "unknown",
    path: window.location.pathname,
  });
}
