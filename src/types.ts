import type React from "react";
import type { StyleProp, TextStyle, ViewProps, ViewStyle } from "react-native";

export type Side = "top" | "right" | "bottom" | "left";

export type Align = "start" | "center" | "end";

export type PresetAnimation = "none" | "fadeIn" | "zoomIn";

/**
 * Groups all parts of an anchored popup (tooltip / popover).
 * Doesn't render its own element on web; renders the native anchor container
 * on iOS/Android.
 */
export type RootProps = ViewProps & {
  children?: React.ReactNode;
  /**
   * Whether the popup is currently open (controlled).
   */
  open?: boolean;
  /**
   * Whether the popup is initially open (uncontrolled).
   * @default false
   */
  defaultOpen?: boolean;
  /**
   * Event handler called when the popup is opened or closed.
   */
  onOpenChange?: (open: boolean) => void;
  /**
   * Called when the popup is dismissed (uncontrolled usage).
   */
  onDismiss?: () => void;
  /**
   * Popover & web only - whether the popover should trap focus.
   * @default false
   */
  modal?: boolean;
  /**
   * Android only
   */
  disableDismissWhenTouchOutside?: boolean;
};

export type TriggerProps = ViewProps & {
  children?: React.ReactNode;
  /**
   * Whether interacting with the trigger is disabled.
   */
  disabled?: boolean;
  /**
   * Tooltip & web only - how long to wait before opening on hover (ms).
   */
  delay?: number;
  /**
   * Tooltip & web only - how long to wait before closing after the pointer
   * leaves (ms).
   */
  closeDelay?: number;
};

export type PortalProps = {
  children?: React.ReactNode;
  /**
   * Web only - a parent element to render the portal element into.
   */
  container?: HTMLElement | null;
};

/**
 * Positions the popup against the trigger.
 */
export type PositionerProps = {
  children?: React.ReactNode;
  /**
   * Which side of the trigger the popup is placed on.
   * @default "top"
   */
  side?: Side;
  /**
   * Distance between the popup and the trigger.
   */
  sideOffset?: number;
  /**
   * Web only - how the popup is aligned relative to the trigger.
   */
  align?: Align;
};

/**
 * The popup bubble. Style it exactly like a React Native `<View>`/`<Text>`:
 * pass a string as children for a text popup (text style fields like
 * `color`/`fontSize`/`fontWeight` are read from `style`), or any React nodes
 * for fully custom content.
 */
export type PopupProps = ViewProps & {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle & TextStyle>;
  /**
   * Web only - class name applied to the popup element.
   */
  className?: string;
  presetAnimation?: PresetAnimation;
  /**
   * iOS only - show animation duration in milliseconds.
   */
  showDuration?: number;
  /**
   * iOS only - dismiss animation duration in milliseconds.
   */
  dismissDuration?: number;
  /**
   * Native only - whether tapping the popup should keep it open.
   */
  disableTapToDismiss?: boolean;
  /**
   * No longer does anything. The rubber-band drag came from the SwiftUI
   * popover library iOS used to be built on; the popup is a UIKit overlay now.
   * @deprecated
   */
  disableDrag?: boolean;
  onTap?: () => void;
};

export type ArrowProps = {
  width?: number;
  height?: number;
  /**
   * Defaults to the popup's `style.backgroundColor`.
   */
  backgroundColor?: string;
  /**
   * Web only - class name applied to the arrow element.
   */
  className?: string;
  children?: React.ReactNode;
};

/**
 * The component set returned for an anchored popup (Tooltip / Popover).
 */
export type AnchoredPopupComponents = {
  Root: React.ComponentType<RootProps>;
  Trigger: React.ComponentType<TriggerProps>;
  Portal: React.ComponentType<PortalProps>;
  Positioner: React.ComponentType<PositionerProps>;
  Popup: React.ComponentType<PopupProps>;
  Arrow: React.ComponentType<ArrowProps>;
};

export type AnchoredPopupKind = "tooltip" | "popover";

// ---------------------------------------------------------------------------
// Toast

export type ToastType = "default" | "success" | "error" | "warning" | "info";

export type ToastObject<Data = Record<string, unknown>> = {
  id: string;
  title?: string;
  description?: string;
  type?: ToastType;
  /**
   * Auto-dismiss timeout in milliseconds. 0 disables auto-dismiss.
   */
  timeout?: number;
  data?: Data;
  /**
   * Lifecycle state — "closing" toasts are playing their exit animation and
   * are removed once it finishes.
   */
  state?: "open" | "closing";
};

export type ToastAddOptions<Data = Record<string, unknown>> = Omit<
  ToastObject<Data>,
  "id"
> & { id?: string };

export type ToastManager = {
  /**
   * Shows a toast. When the visible limit is reached it is queued, or — with
   * `overflow: "replace"` — the oldest visible toast is closed to make room.
   * Calling `add` again with the same `id` updates the existing toast and
   * restarts its timer instead of enqueuing a duplicate.
   */
  add: (options: ToastAddOptions) => string;
  /**
   * Starts closing a toast (plays the exit animation, then removes it and
   * promotes the next queued toast).
   */
  close: (id: string) => void;
  /**
   * Removes a toast immediately. Called by `Toast.Root` after the exit
   * animation completes; also safe to call directly.
   */
  finalize: (id: string) => void;
  update: (id: string, options: Partial<ToastAddOptions>) => void;
  /**
   * Holds one toast's auto-dismiss countdown, keeping whatever time is left.
   * `Toast.Root` calls this while the toast is being touched, dragged or
   * hovered, so it does not vanish mid-interaction.
   */
  pause: (id: string) => void;
  /** Lets a paused countdown run again from where it stopped. */
  resume: (id: string) => void;
  /**
   * Holds every countdown. `Toast.Provider` calls this when the app leaves
   * the foreground, so a toast is not spent while nobody can see it.
   */
  pauseAll: () => void;
  resumeAll: () => void;
  /**
   * The currently visible toasts (newest first). Queued toasts are not
   * included — they appear as visible slots free up.
   */
  getToasts: () => ToastObject[];
  subscribe: (listener: () => void) => () => void;
};
