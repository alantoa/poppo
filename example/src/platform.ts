import { Platform } from "react-native";

export function isAndroidWeb(): boolean {
  return (
    typeof navigator !== "undefined" && /android/i.test(navigator.userAgent)
  );
}

export function isIOSWeb(): boolean {
  if (typeof navigator === "undefined") return false;
  if (/iPhone|iPod|iPad/.test(navigator.userAgent)) return true;
  // iPadOS Safari reports a Macintosh user agent by default. Without this an
  // iPad gets the hover-driven tooltip, which it has no way to open.
  return (
    /Macintosh/.test(navigator.userAgent) && (navigator.maxTouchPoints ?? 0) > 1
  );
}

export function isMobileWeb(): boolean {
  return Platform.OS === "web" && (isAndroidWeb() || isIOSWeb());
}
