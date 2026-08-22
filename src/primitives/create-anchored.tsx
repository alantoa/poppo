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
  useWindowDimensions,
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
import { POPUP_BODY_NATIVE_ID, POPUP_CONTENT_NATIVE_ID } from "../utils/slots";

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
// 2. Custom children are rendered by React Native inside the popup slot, so
//    every style works — see `popupSlotStyle`.
const firstChildStyle = (children: React.ReactNode) => {
  const items = React.Children.toArray(children).filter(Boolean);
  for (const child of items) {
    if (
      React.isValidElement(child) &&
      child.props &&
      (child.props as any).style
    ) {
      return StyleSheet.flatten((child.props as any).style) as any;
    }
  }
  return {} as any;
};

const resolvePopupLayout = (children: React.ReactNode, style: any) => {
  const flat = StyleSheet.flatten(style) ?? ({} as any);
  const useNativeText = isTextContent(children);
  // Custom bubbles usually put chrome on the inner View, not Popup.
  // Native still needs those values to draw the arrow so the two layers
  // share one radius and fill.
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
  toggle: () => void;
};

export const createAnchoredSet = (
  _kind: AnchoredPopupKind,
): AnchoredPopupComponents => {
  const AnchoredContext = createContext<AnchoredContextValue>({
    open: false,
    setOpen: () => {},
    toggle: () => {},
  });

  const Trigger = ({
    children,
    disabled,
    delay: _delay,
    closeDelay: _closeDelay,
    ...rest
  }: TriggerProps) => {
    const { toggle } = useContext(AnchoredContext);
    return (
      <Pressable disabled={disabled} onPress={toggle} {...rest}>
        {children}
      </Pressable>
    );
  };

  const Portal = ({ children }: PortalProps) => <>{children}</>;

  const Positioner = ({ children }: PositionerProps) => <>{children}</>;

  // The slot is the box native moves into the popup window. It is:
  //
  // * absolute, so the bubble never takes part in the trigger's row — an
  //   in-flow child would push the trigger sideways and out of its card;
  // * as wide as the window, because Yoga measures an absolute child inside
  //   its containing block. Left to hug a 68pt trigger, a `maxWidth: 260`
  //   bubble wrapped into a narrow column;
  // * `box-none`, so the empty area left over by that measuring width stays
  //   transparent to touches and outside taps still dismiss the popup.
  //
  // The bubble itself is the inner body view: it hugs its content, and its
  // frame is what native positions and sizes the popup window from.
  const popupSlotStyle = {
    position: "absolute",
    top: 0,
    left: 0,
    overflow: "visible",
  } as const;

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
    const { open } = useContext(AnchoredContext);
    const { width: windowWidth } = useWindowDimensions();
    // Splitting the arrow out walks the child list; it only has to happen
    // when the children themselves change, not on every parent render.
    const { childrenWithoutArrow, isText } = useMemo(() => {
      const [withoutArrow] = pickChild(children, Arrow);
      return {
        childrenWithoutArrow: withoutArrow,
        isText: isTextContent(withoutArrow),
      };
    }, [children]);
    const slotStyle = useMemo(
      () => [popupSlotStyle, { width: windowWidth }],
      [windowWidth],
    );
    const bodyStyle = useMemo(
      () => [style, { alignSelf: "flex-start", flexShrink: 0 } as const],
      [style],
    );
    if (isText) {
      // Text bubbles are drawn natively from props. Do not mount a
      // placeholder — a dummy child would compete with the trigger for
      // the content slot after remounts.
      return null;
    }
    return (
      <View
        nativeID={POPUP_CONTENT_NATIVE_ID}
        collapsable={false}
        pointerEvents="box-none"
        style={slotStyle}
      >
        <View
          nativeID={POPUP_BODY_NATIVE_ID}
          collapsable={false}
          pointerEvents={open ? "auto" : "none"}
          style={bodyStyle}
          {...(Platform.OS === "android" && onTap ? { onTouchEnd: onTap } : {})}
          {...rest}
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
    const toggle = useCallback(() => setOpen(!open), [open, setOpen]);
    const contextValue = useMemo(
      () => ({ open, setOpen, toggle }),
      [open, setOpen, toggle],
    );

    // Reading the compound parts means walking the element tree and
    // flattening styles. None of it depends on `open`, so it must not be
    // redone every time the popup toggles or a parent re-renders — a list
    // of anchors would repeat the whole scan per row.
    const parts = useMemo(() => {
      const [withoutTrigger, triggerChildren] = pickChild(children, Trigger);

      const positionerEl = findElement(withoutTrigger, Positioner);
      const popupEl =
        findElement(withoutTrigger, Popup) ??
        findElement((positionerEl?.props as any)?.children, Popup);
      const { side, sideOffset } = (positionerEl?.props ??
        {}) as PositionerProps;
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

      return {
        withoutTrigger,
        triggerChildren,
        side,
        sideOffset,
        popupProps,
        nativeTextProps,
        text: useNativeText ? nativeTextProps.text : undefined,
        bubbleColor: processColor(arrowColor ?? bubbleColor),
        bubbleRadius,
        arrowWidth,
        arrowHeight,
      };
    }, [children]);

    const {
      withoutTrigger,
      triggerChildren,
      side,
      sideOffset,
      popupProps,
      nativeTextProps,
      text,
      bubbleColor,
      bubbleRadius,
      arrowWidth,
      arrowHeight,
    } = parts;

    const { style: rootStyle, ...rootRest } = rest;
    const nativeStyle = useMemo(
      () => [
        { alignSelf: "flex-start", overflow: "visible" } as const,
        rootStyle,
      ],
      [rootStyle],
    );
    const handleDismiss = useCallback(() => setOpen(false), [setOpen]);

    return (
      <AnchoredContext.Provider value={contextValue}>
        <NativeView
          open={open}
          side={side}
          sideOffset={sideOffset}
          bubbleColor={bubbleColor}
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
          text={text}
          onDismiss={handleDismiss}
          style={nativeStyle}
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
