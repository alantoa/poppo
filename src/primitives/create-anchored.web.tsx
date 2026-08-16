import { Popover as BasePopover } from "@base-ui/react/popover";
import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import React, { createContext, forwardRef, useContext, useMemo } from "react";
import { StyleSheet, Text as RNText, View } from "react-native";

import type {
  AnchoredPopupComponents,
  AnchoredPopupKind,
  ArrowProps,
  PopupProps,
  PortalProps,
  PositionerProps,
  RootProps,
  TriggerProps,
} from "../types";
import "../styles.css";
import { pickChild } from "../utils/pick-child";

const isTextContent = (children: React.ReactNode) => {
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    items.length > 0 &&
    items.every((c) => typeof c === "string" || typeof c === "number")
  );
};

const TEXT_STYLE_KEYS = [
  "color",
  "fontSize",
  "fontWeight",
  "fontFamily",
  "fontStyle",
  "lineHeight",
  "letterSpacing",
  "textAlign",
  "textTransform",
] as const;

export const createAnchoredSet = (
  kind: AnchoredPopupKind,
): AnchoredPopupComponents => {
  const Base: any = kind === "tooltip" ? BaseTooltip : BasePopover;

  // Lets the arrow inherit the bubble's background color without requiring an
  // explicit `backgroundColor` prop on Arrow.
  const PopupStyleContext = createContext<{ bubbleColor?: string }>({});

  const Root = ({
    children,
    open,
    defaultOpen,
    onOpenChange,
    onDismiss,
    modal = false,
    // native-only props, ignored on web
    disableDismissWhenTouchOutside: _disableDismissWhenTouchOutside,
    ...rest
  }: RootProps) => {
    const handleOpenChange = (state: boolean) => {
      onOpenChange?.(state);
      if (open === undefined && state === false) {
        onDismiss?.();
      }
    };

    if (kind === "popover") {
      return (
        <Base.Root
          open={open}
          defaultOpen={defaultOpen}
          onOpenChange={handleOpenChange}
          modal={modal}
        >
          {children}
        </Base.Root>
      );
    }
    return (
      <Base.Root
        open={open}
        defaultOpen={defaultOpen}
        onOpenChange={handleOpenChange}
      >
        {children}
      </Base.Root>
    );
  };

  const Trigger = ({
    children,
    disabled,
    delay,
    closeDelay,
    ...rest
  }: TriggerProps) => {
    const extra =
      kind === "tooltip" ? { delay, closeDelay, disabled } : { disabled };
    return (
      <Base.Trigger
        render={
          <div
            style={{
              display: "inline-flex",
              width: "max-content",
              maxWidth: "max-content",
              flex: "0 0 auto",
              alignSelf: "flex-start",
              verticalAlign: "middle",
            }}
          />
        }
        nativeButton={false}
        {...extra}
        {...(rest as any)}
      >
        {children}
      </Base.Trigger>
    );
  };

  const Portal = ({ children, container }: PortalProps) => (
    <Base.Portal container={container}>{children}</Base.Portal>
  );

  const Positioner = ({
    children,
    side = "top",
    sideOffset,
    align,
    ...rest
  }: PositionerProps) => (
    <Base.Positioner
      side={side}
      sideOffset={sideOffset}
      align={align}
      {...(rest as any)}
    >
      {children}
    </Base.Positioner>
  );

  const Popup = forwardRef<HTMLDivElement, PopupProps>(function Popup(
    {
      children,
      style,
      className,
      presetAnimation,
      onTap,
      // native-only props, ignored on web
      showDuration: _showDuration,
      dismissDuration: _dismissDuration,
      disableTapToDismiss: _disableTapToDismiss,
      ...rest
    },
    ref,
  ) {
    const flat = (StyleSheet.flatten(style) ?? {}) as any;
    const bubbleColor = flat.backgroundColor as string | undefined;
    const contextValue = useMemo(() => ({ bubbleColor }), [bubbleColor]);

    const animationClass =
      presetAnimation === "fadeIn"
        ? "ut-anim-fade"
        : presetAnimation === "zoomIn"
          ? "ut-anim-zoom"
          : "";

    const [childrenWithoutArrow, arrowChildren] = pickChild(children, Arrow);

    let content: React.ReactNode = childrenWithoutArrow;
    if (isTextContent(childrenWithoutArrow)) {
      const textStyle: Record<string, any> = {};
      for (const key of TEXT_STYLE_KEYS) {
        if (flat[key] != null) textStyle[key] = flat[key];
      }
      content = (
        <RNText style={textStyle as any}>{childrenWithoutArrow}</RNText>
      );
    }

    return (
      <PopupStyleContext.Provider value={contextValue}>
        <Base.Popup
          ref={ref}
          className={`${animationClass} ${className ?? ""}`}
          onClick={onTap}
          style={{
            backgroundColor: bubbleColor,
            borderRadius: flat.borderRadius,
          }}
        >
          <View style={style as any} {...rest}>
            {content}
          </View>
          {arrowChildren}
        </Base.Popup>
      </PopupStyleContext.Provider>
    );
  });

  const Arrow = ({
    backgroundColor,
    width = 10,
    height = 5,
    className,
    ...rest
  }: ArrowProps) => {
    const { bubbleColor } = useContext(PopupStyleContext);
    const fill = backgroundColor ?? bubbleColor ?? "#000";

    return (
      <Base.Arrow
        className={`ut-arrow ${className ?? ""}`}
        style={
          {
            "--ut-arrow-width": `${width}px`,
            "--ut-arrow-height": `${height}px`,
          } as React.CSSProperties
        }
        {...rest}
      >
        <svg
          width={width}
          height={height}
          viewBox="0 0 10 5"
          preserveAspectRatio="none"
          style={{ display: "block" }}
        >
          <polygon points="5,0 10,5 0,5" fill={fill} />
        </svg>
      </Base.Arrow>
    );
  };

  return {
    Root,
    Trigger: Trigger as AnchoredPopupComponents["Trigger"],
    Portal,
    Positioner,
    Popup: Popup as unknown as AnchoredPopupComponents["Popup"],
    Arrow,
  };
};
