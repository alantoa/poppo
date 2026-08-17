import { requireNativeViewManager } from "expo-modules-core";
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import {
  Dimensions,
  Platform,
  Pressable,
  StyleSheet,
  View,
  processColor,
} from "react-native";

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
import { findElement } from "../utils/find-element";
import { pickChild } from "../utils/pick-child";
import { POPUP_CONTENT_NATIVE_ID } from "../utils/slots";

const NativeView: React.ComponentType<any> =
  requireNativeViewManager("UniversalTooltip");

const isTextContent = (children: React.ReactNode) => {
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    items.length > 0 &&
    items.every((c) => typeof c === "string" || typeof c === "number")
  );
};

const textContentOf = (children: React.ReactNode) =>
  React.Children.toArray(children)
    .filter((c) => typeof c === "string" || typeof c === "number")
    .join("");

// The popup can be rendered in two ways on native:
//
// 1. String children use the native text bubble. A React-rendered bubble
//    would be laid out inside the trigger's containing block, so a narrow
//    trigger (e.g. a 24pt icon) would squeeze the text — the native bubble
//    measures itself against the screen instead. The `style` fields that make
//    sense for a bubble (backgroundColor, borderRadius, padding*, width /
//    maxWidth) and for its text (fontSize, color, fontWeight, fontFamily)
//    are bridged over automatically.
// 2. Custom children are rendered by React Native — give the content an
//    explicit size (like any absolutely-positioned RN view) and every style
//    works.
const firstChildStyle = (children: React.ReactNode) => {
  const items = React.Children.toArray(children).filter(Boolean);
  for (const child of items) {
    if (React.isValidElement(child) && child.props && (child.props as any).style) {
      return StyleSheet.flatten((child.props as any).style) as any;
    }
  }
  return {} as any;
};

const resolvePopupLayout = (children: React.ReactNode, style: any) => {
  const flat = StyleSheet.flatten(style) ?? ({} as any);
  const useNativeText = isTextContent(children);
  // Custom bubbles usually put chrome on the inner View, not Popup.
  // Native still needs those values to draw the arrow (and on Android,
  // the Balloon body) so the two layers share one radius and fill.
  const child = useNativeText ? {} : firstChildStyle(children);

  const bubbleColor = flat.backgroundColor ?? child.backgroundColor;
  const bubbleRadius = flat.borderRadius ?? child.borderRadius;

  let nativeTextProps: Record<string, any> = {};
  if (useNativeText) {
    const paddingTop = flat.paddingTop ?? flat.paddingVertical ?? flat.padding;
    const paddingBottom =
      flat.paddingBottom ?? flat.paddingVertical ?? flat.padding;
    const paddingLeft =
      flat.paddingLeft ?? flat.paddingHorizontal ?? flat.padding;
    const paddingRight =
      flat.paddingRight ?? flat.paddingHorizontal ?? flat.padding;
    nativeTextProps = {
      text: textContentOf(children),
      textStyle: {
        ...(flat.fontSize != null ? { fontSize: flat.fontSize } : {}),
        ...(flat.color != null ? { color: processColor(flat.color) } : {}),
        ...(flat.fontWeight != null
          ? { fontWeight: String(flat.fontWeight) }
          : {}),
        ...(flat.fontFamily != null ? { fontFamily: flat.fontFamily } : {}),
      },
      maxWidth: flat.maxWidth ?? flat.width,
      containerStyle: {
        ...(paddingTop != null ? { paddingTop } : {}),
        ...(paddingBottom != null ? { paddingBottom } : {}),
        ...(paddingLeft != null ? { paddingLeft } : {}),
        ...(paddingRight != null ? { paddingRight } : {}),
      },
    };
  }

  return { useNativeText, bubbleColor, bubbleRadius, nativeTextProps };
};

type AnchoredContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  setContentLayout: (size: { width: number; height: number }) => void;
};

export const createAnchoredSet = (
  _kind: AnchoredPopupKind,
): AnchoredPopupComponents => {
  const AnchoredContext = createContext<AnchoredContextValue>({
    open: false,
    setOpen: () => {},
    setContentLayout: () => {},
  });

  const Trigger = ({
    children,
    disabled,
    delay: _delay,
    closeDelay: _closeDelay,
    ...rest
  }: TriggerProps) => {
    const { open, setOpen } = useContext(AnchoredContext);
    return (
      <Pressable disabled={disabled} onPress={() => setOpen(!open)} {...rest}>
        {children}
      </Pressable>
    );
  };

  const Portal = ({ children }: PortalProps) => <>{children}</>;

  const Positioner = ({ children }: PositionerProps) => <>{children}</>;

  // Note: `position: "absolute"` without top/left/right/bottom keeps the
  // popup wrapper out of the trigger's layout while letting it size to its
  // own content — the native side reads this size to measure the bubble.
  // Android clips overflow by default, so a short trigger would crop the
  // popup (the Confirm "Remove" button sat below the clip and vanished).
  const popupWrapperStyle = {
    position: "absolute",
    overflow: "visible",
    alignSelf: "flex-start",
    flexShrink: 0,
  } as const;

  const reportContentLayout = (
    setContentLayout: AnchoredContextValue["setContentLayout"],
    width: number,
    height: number,
  ) => {
    if (width <= 0 || height <= 0) return;
    // An absolute popup is in an unbounded Yoga context. A `flex: 1`
    // descendant can inherit the window height (we measured 64×774 and
    // Popovers clamped that strip onto the status bar). Ignore those.
    const { width: sw, height: sh } = Dimensions.get("window");
    if (width > sw || height > sh * 0.5) return;
    setContentLayout({ width, height });
  };

  const Popup = ({
    children,
    style,
    onTap,
    presetAnimation: _presetAnimation,
    showDuration: _showDuration,
    dismissDuration: _dismissDuration,
    disableTapToDismiss: _disableTapToDismiss,
    disableDrag: _disableDrag,
    className: _className,
    ...rest
  }: PopupProps) => {
    const { open, setContentLayout } = useContext(AnchoredContext);
    const [childrenWithoutArrow] = pickChild(children, Arrow);
    const childStyle = firstChildStyle(childrenWithoutArrow);
    // Yoga sizes an absolute child to the trigger if we don't give a
    // width. Use the bubble's own width / maxWidth so Rich content is
    // not measured as a 64pt-wide column.
    const measureWidth = childStyle.width ?? childStyle.maxWidth;
    if (isTextContent(childrenWithoutArrow)) {
      // Text bubbles are drawn natively from props. Do not mount a
      // placeholder — a dummy child would compete with the trigger for
      // the content slot after remounts.
      return null;
    }
    return (
      <View
        nativeID={POPUP_CONTENT_NATIVE_ID}
        collapsable={false}
        pointerEvents={open ? "auto" : "none"}
        style={[
          style,
          popupWrapperStyle,
          open && measureWidth != null ? { width: measureWidth } : null,
          // Closed: collapse so Android Yoga does not grow the trigger
          // row to the bubble width and clip the Show chip.
          !open ? { width: 0, height: 0, overflow: "hidden" } : null,
          // Fabric owns opacity. Native `alpha = 0` is overwritten on the
          // next style pass, which painted the Rich Wi‑Fi bubble over Show.
          { opacity: open ? 1 : 0, zIndex: open ? 0 : -1 },
        ]}
        onLayout={(event) => {
          if (!open) return;
          const { width, height } = event.nativeEvent.layout;
          reportContentLayout(setContentLayout, width, height);
        }}
        {...(Platform.OS === "android" && onTap ? { onTouchEnd: onTap } : {})}
        {...rest}
      >
        <View
          collapsable={false}
          style={{ alignSelf: "flex-start", flexShrink: 0 }}
          onLayout={(event) => {
            if (!open) return;
            const { width, height } = event.nativeEvent.layout;
            reportContentLayout(setContentLayout, width, height);
          }}
        >
          {childrenWithoutArrow}
        </View>
      </View>
    );
  };

  const Arrow = (_props: ArrowProps) => {
    // The arrow is drawn natively; its props are read by Root.
    return null;
  };

  const Root = ({
    children,
    open: openProp,
    defaultOpen = false,
    onOpenChange,
    onDismiss,
    modal: _modal,
    disableDismissWhenTouchOutside,
    ...rest
  }: RootProps) => {
    const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
    const [contentLayout, setContentLayout] = useState({
      width: 0,
      height: 0,
    });
    const open = openProp ?? uncontrolledOpen;
    const setOpen = useCallback(
      (next: boolean) => {
        if (openProp === undefined) {
          setUncontrolledOpen(next);
        }
        onOpenChange?.(next);
        if (!next) {
          // Drop the parked measurement so the next open waits for a
          // layout that includes later children (Pressables).
          setContentLayout({ width: 0, height: 0 });
          onDismiss?.();
        }
      },
      [openProp, onOpenChange, onDismiss],
    );
    const applyContentLayout = useCallback(
      (size: { width: number; height: number }) => {
        if (size.width <= 0 && size.height <= 0) {
          setContentLayout({ width: 0, height: 0 });
          return;
        }
        // Keep the larger plausible size. A later inner onLayout can be
        // just the title block; replacing would clip the Remove button.
        setContentLayout((prev) => ({
          width: Math.max(prev.width, size.width),
          height: Math.max(prev.height, size.height),
        }));
      },
      [],
    );
    const contextValue = useMemo(
      () => ({
        open,
        setOpen,
        setContentLayout: applyContentLayout,
      }),
      [open, setOpen, applyContentLayout],
    );

    const [withoutTrigger, triggerChildren] = pickChild(children, Trigger);

    const positionerEl = findElement(withoutTrigger, Positioner);
    const popupEl =
      findElement(withoutTrigger, Popup) ??
      findElement((positionerEl?.props as any)?.children, Popup);
    const { side, sideOffset } = (positionerEl?.props ?? {}) as PositionerProps;
    const popupProps = (popupEl?.props ?? {}) as any;

    const [popupChildrenWithoutArrow] = pickChild(popupProps.children, Arrow);
    const { useNativeText, bubbleColor, bubbleRadius, nativeTextProps } =
      resolvePopupLayout(popupChildrenWithoutArrow, popupProps.style);

    const arrowEl = findElement(popupProps.children, Arrow);
    const {
      width: arrowWidth,
      height: arrowHeight,
      backgroundColor: arrowColor,
    } = (arrowEl?.props ?? {}) as ArrowProps;

    const { style: rootStyle, ...rootRest } = rest;

    return (
      <AnchoredContext.Provider value={contextValue}>
        <NativeView
          open={open}
          side={side}
          sideOffset={sideOffset}
          bubbleColor={processColor(arrowColor ?? bubbleColor)}
          borderRadius={bubbleRadius}
          arrowWidth={arrowWidth}
          arrowHeight={arrowHeight}
          presetAnimation={popupProps.presetAnimation}
          showDuration={popupProps.showDuration}
          dismissDuration={popupProps.dismissDuration}
          disableTapToDismiss={popupProps.disableTapToDismiss}
          disableDrag={popupProps.disableDrag ?? true}
          onTap={popupProps.onTap}
          disableDismissWhenTouchOutside={disableDismissWhenTouchOutside}
          {...nativeTextProps}
          text={useNativeText ? nativeTextProps.text : undefined}
          contentWidth={contentLayout.width}
          contentHeight={contentLayout.height}
          onDismiss={() => setOpen(false)}
          style={[{ alignSelf: "flex-start", overflow: "visible" }, rootStyle]}
          {...rootRest}
        >
          {triggerChildren}
          {withoutTrigger}
        </NativeView>
      </AnchoredContext.Provider>
    );
  };

  return { Root, Trigger, Portal, Positioner, Popup, Arrow };
};
