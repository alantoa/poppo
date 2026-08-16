import { requireNativeViewManager } from "expo-modules-core";
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import {
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
const resolvePopupLayout = (children: React.ReactNode, style: any) => {
  const flat = StyleSheet.flatten(style) ?? ({} as any);
  const useNativeText = isTextContent(children);

  const bubbleColor = flat.backgroundColor;
  const bubbleRadius = flat.borderRadius;

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
};

export const createAnchoredSet = (
  _kind: AnchoredPopupKind,
): AnchoredPopupComponents => {
  const AnchoredContext = createContext<AnchoredContextValue>({
    open: false,
    setOpen: () => {},
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
  const popupWrapperStyle = { position: "absolute" } as const;

  const Popup = ({
    children,
    style,
    onTap,
    presetAnimation: _presetAnimation,
    showDuration: _showDuration,
    dismissDuration: _dismissDuration,
    disableTapToDismiss: _disableTapToDismiss,
    className: _className,
    ...rest
  }: PopupProps) => {
    const [childrenWithoutArrow] = pickChild(children, Arrow);
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
        style={[style, popupWrapperStyle]}
        // On Android the bubble lives in a PopupWindow with its own React
        // touch dispatcher, so `onTap` is delivered from JS. On iOS the
        // native tap gesture dispatches the `onTap` event instead.
        {...(Platform.OS === "android" && onTap ? { onTouchEnd: onTap } : {})}
        {...rest}
      >
        {childrenWithoutArrow}
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
    const open = openProp ?? uncontrolledOpen;
    const setOpen = useCallback(
      (next: boolean) => {
        if (openProp === undefined) {
          setUncontrolledOpen(next);
        }
        onOpenChange?.(next);
        if (!next) {
          onDismiss?.();
        }
      },
      [openProp, onOpenChange, onDismiss],
    );
    const contextValue = useMemo(() => ({ open, setOpen }), [open, setOpen]);

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
          onTap={popupProps.onTap}
          disableDismissWhenTouchOutside={disableDismissWhenTouchOutside}
          {...nativeTextProps}
          text={useNativeText ? nativeTextProps.text : null}
          onDismiss={() => setOpen(false)}
          style={[{ alignSelf: "flex-start" }, rootStyle]}
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
