import type {
  TooltipProps,
  TooltipContentProps,
  TooltipTriggerProps,
  TooltipPortalProps,
  TooltipArrowProps
} from "@radix-ui/react-tooltip";
import React from "react";
import type { TextStyle, ViewProps } from "react-native";

export type PortalProps = ViewProps & TooltipPortalProps;
export type TriggerProps = ViewProps & TooltipTriggerProps;

export type TextProps = {
  style?: TextStyle;
  text?: string;
};

export type ContentProps = ViewProps &
  TooltipContentProps & {
    sideOffset?: number;
    side?: "left" | "right" | "bottom" | "top";
    borderRadius?: number;
    // tooltip content max width
    maxWidth?: number;
    backgroundColor?: string;
    presetAnimation?: "none" | "fadeIn" | "zoomIn";
    dismissDuration?: number;
    showDuration?: number;
    disableTapToDismiss?: boolean;
    onTap?: () => void;
    containerStyle?: {
      paddingTop?: number;
      paddingRight?: number;
      paddingBottom?: number;
      paddingLeft?: number;
    };
  };
export type ArrowProps = TooltipArrowProps & {
  backgroundColor?: string;
};

export type UniversalTooltipViewProps = ContentProps & {
  children?: React.ReactNode | JSX.Element;
};

export type RootProps = ViewProps &
  TooltipProps & {
    onDismiss?: () => void;
    /**
     * Android only
     */
    disableDismissWhenTouchOutside?: boolean;
    /**
     * Web only - if true, will use popover instead of tooltip
     * @default false
     */
    usePopover?: boolean;
  };
