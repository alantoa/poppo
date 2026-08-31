import { requireNativeViewManager } from "expo-modules-core";
import * as React from "react";
import {
  Platform,
  useWindowDimensions,
  View,
  type ViewProps,
} from "react-native";

/**
 * The native host behind `<Toast.Viewport presentation="window" />`: it moves
 * its children into an overlay on the window, so the toasts are neither
 * clipped by the tree they were written in nor covered by an open `Modal`.
 *
 * iOS only. Android has no equivalent permission-free primitive — its `Modal`
 * is a `Dialog` with a window of its own, and getting above that means
 * tracking which window is on top (see AGENTS.md) — so there the viewport
 * stays inline.
 */
const NativeToastOverlay: React.ComponentType<
  ViewProps & { toastCount: number }
> | null =
  Platform.OS === "ios"
    ? requireNativeViewManager("UniversalTooltip", "ToastOverlay")
    : null;

/** Whether `presentation="window"` does anything on this platform. */
export const supportsWindowPresentation = NativeToastOverlay !== null;

/**
 * The host takes no space of its own: its children are moved out of it, and it
 * must not disturb the layout of whatever it was written next to.
 */
const HOST_STYLE = {
  position: "absolute",
  top: 0,
  left: 0,
  width: 0,
  height: 0,
} as const;

export type ToastOverlayHostProps = ViewProps & {
  children?: React.ReactNode;
  /** Drives attach / raise / detach of the native overlay. */
  toastCount: number;
};

export const ToastOverlayHost = ({
  children,
  toastCount,
  style,
  ...rest
}: ToastOverlayHostProps) => {
  // Yoga measures an absolute child inside its containing block, and this
  // one's containing block is a 0×0 host, so the slot has to be given the
  // window's size explicitly. Reading it here also re-renders on rotation.
  const { width, height } = useWindowDimensions();
  if (!NativeToastOverlay) {
    return null;
  }
  return (
    <NativeToastOverlay toastCount={toastCount} style={HOST_STYLE}>
      <View
        style={[
          { position: "absolute", top: 0, left: 0, width, height },
          style,
        ]}
        {...rest}
      >
        {children}
      </View>
    </NativeToastOverlay>
  );
};
