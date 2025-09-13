import * as Popover from "@radix-ui/react-popover";
import * as Tooltip from "@radix-ui/react-tooltip";
import React, {
  useMemo,
  Fragment,
  createContext,
  useContext,
  forwardRef,
} from "react";
import { Text as RNText, View } from "react-native";

import {
  ContentProps,
  RootProps,
  TextProps,
  TriggerProps,
  PortalProps,
  ArrowProps,
} from "./universal-tooltip.types";
import "./styles.css";
import { pickChildren } from "./utils/pick-children";

export const TooltipContext = createContext<{ usePopover: boolean }>({
  usePopover: false,
});

export const Trigger = ({ children, ...rest }: TriggerProps) => {
  const { usePopover } = useContext(TooltipContext);

  const TooltipTrigger = usePopover ? Popover.Trigger : Tooltip.Trigger;

  return (
    <TooltipTrigger asChild {...rest}>
      <div>{children}</div>
    </TooltipTrigger>
  );
};

export const Portal = ({ children, ...rest }: PortalProps) => {
  const { usePopover } = useContext(TooltipContext);

  const TooltipPortal = usePopover ? Popover.Portal : Tooltip.Portal;

  return <TooltipPortal {...rest}>{children}</TooltipPortal>;
};
export const Root = ({
  children,
  onDismiss,
  open,
  usePopover = false,
  ...rest
}: RootProps) => {
  const TooltipProvider = usePopover ? Fragment : Tooltip.Provider;
  const TooltipRoot = usePopover ? Popover.Root : Tooltip.Root;

  return (
    <TooltipContext.Provider value={{ usePopover }}>
      <TooltipProvider>
        <TooltipRoot
          onOpenChange={(state) => {
            if (open === undefined && state === false) {
              onDismiss?.();
            }
          }}
          open={open}
          {...rest}
        >
          {children}
        </TooltipRoot>
      </TooltipProvider>
    </TooltipContext.Provider>
  );
};
export const Arrow = ({ backgroundColor, ...rest }: ArrowProps) => {
  const { usePopover } = useContext(TooltipContext);
  const TooltipArrow = usePopover ? Popover.Arrow : Tooltip.Arrow;
  return <TooltipArrow fill={backgroundColor ?? "#000"} {...rest} />;
};
export const Content = forwardRef<any, ContentProps>(
  function UniversalTooltipContent({ children, ...rest }, ref) {
    const {
      side,
      dismissDuration,
      containerStyle,
      presetAnimation,
      backgroundColor,
      borderRadius,
      onTap,
      className,
      disableTapToDismiss,
      maxWidth,
      ...restProps
    } = rest;
    const { usePopover } = useContext(TooltipContext);
    const [, triggerChildren] = pickChildren(children, Text);
    const TooltipContent = usePopover ? Popover.Content : Tooltip.Content;

    const animationClass = useMemo(() => {
      switch (presetAnimation) {
        case "fadeIn":
          return `tooltip-fade-in-${side ?? "top"}`;
        case "zoomIn":
          return "tooltip-zoom-in";
        default:
          return "";
      }
    }, [presetAnimation]);

    return (
      <TooltipContent
        side={side}
        ref={ref}
        className={`${animationClass} ${className}`}
        onClick={onTap}
        {...restProps}
      >
        <View
          style={[
            (triggerChildren as any)?.length > 0
              ? { backgroundColor, borderRadius, maxWidth, ...containerStyle }
              : {},
          ]}
        >
          {children}
        </View>
      </TooltipContent>
    );
  },
);
export const Text = ({ text, ...rest }: TextProps) => {
  return <RNText {...rest}>{text}</RNText>;
};
