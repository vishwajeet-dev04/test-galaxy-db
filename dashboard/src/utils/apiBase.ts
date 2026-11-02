import { Capacitor } from "@capacitor/core";

/**
 * Staging API host for the Android shell. Web builds keep relative `/api` (same origin).
 * Override with VITE_API_BASE when pointing a native build at another environment.
 */
const NATIVE_API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, "") ||
  "http://20.219.14.83:8081";

export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** Prefix relative `/api/...` paths when running inside the Capacitor APK. */
export function apiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (!isNativeApp()) return normalized;
  return `${NATIVE_API_BASE}${normalized}`;
}
