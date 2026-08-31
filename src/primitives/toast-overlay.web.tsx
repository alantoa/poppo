import type * as React from "react";
import type { ViewProps } from "react-native";

// Web keeps the viewport inline. There is nothing to escape from: a fixed
// element already sits above the document, and Base UI's own popups portal
// themselves. This file exists so the web bundle never reaches for the native
// view manager.

export const supportsWindowPresentation = false;

export type ToastOverlayHostProps = ViewProps & {
  children?: React.ReactNode;
  toastCount: number;
};

export const ToastOverlayHost = (
  _props: ToastOverlayHostProps,
): React.ReactElement | null => null;
