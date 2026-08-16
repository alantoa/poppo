import { Platform } from "react-native";

export function isAndroidWeb(): boolean {
  return (
    typeof navigator !== "undefined" && /android/i.test(navigator.userAgent)
  );
}

export function isIOSWeb(): boolean {
  return (
    typeof navigator !== "undefined" &&
    /iPhone|iPod|iPad/.test(navigator.userAgent)
  );
}

export function isMobileWeb(): boolean {
  return Platform.OS === "web" && (isAndroidWeb() || isIOSWeb());
}
