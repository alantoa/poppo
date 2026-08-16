import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import {
  Animated,
  PanResponder,
  Pressable,
  Text as RNText,
  View,
  type PressableProps,
  type StyleProp,
  type TextStyle,
  type ViewProps,
  type ViewStyle,
} from "react-native";

import type { ToastAddOptions, ToastManager, ToastObject } from "./types";

// ---------------------------------------------------------------------------
// Manager — a small external store with queue scheduling, mirroring Base UI's
// Toast.createToastManager():
//
// - At most `limit` toasts are visible at once (default 1). Adding more
//   enqueues them; they are promoted as visible slots free up.
// - `add` with an existing `id` UPDATES that toast and restarts its timer —
//   pressing the same button repeatedly refreshes one toast instead of
//   stacking duplicates.
// - `close` marks the toast as "closing" so the exit animation can play;
//   `finalize` (called by Toast.Root when the animation ends, with a safety
//   fallback timer) removes it and promotes the next queued toast.
// - Auto-dismiss timers only run while a toast is visible — queued toasts
//   get their full timeout once shown.

let idCounter = 0;

// Safety net: if no Toast.Root is rendered for a closing toast (so nothing
// calls finalize), remove it anyway after the exit animation should have
// long finished.
const FINALIZE_FALLBACK_MS = 600;

export const createToastManager = (defaults?: {
  /**
   * Default auto-dismiss timeout in milliseconds. 0 disables auto-dismiss.
   * @default 5000
   */
  timeout?: number;
  /**
   * Maximum number of toasts visible at once — additional toasts are queued.
   * @default 1
   */
  limit?: number;
}): ToastManager => {
  const defaultTimeout = defaults?.timeout ?? 5000;
  const limit = Math.max(1, defaults?.limit ?? 1);

  let visible: ToastObject[] = [];
  let queue: ToastObject[] = [];
  const listeners = new Set<() => void>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  const notify = () => listeners.forEach((listener) => listener());

  const clearTimer = (id: string) => {
    const timer = timers.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.delete(id);
    }
  };

  const startTimer = (toast: ToastObject) => {
    clearTimer(toast.id);
    const dismissAfter = toast.timeout ?? defaultTimeout;
    if (dismissAfter > 0) {
      timers.set(
        toast.id,
        setTimeout(() => close(toast.id), dismissAfter),
      );
    }
  };

  const openCount = () =>
    visible.filter((toast) => toast.state !== "closing").length;

  const promote = () => {
    while (queue.length > 0 && openCount() < limit) {
      const next = queue[0] as ToastObject;
      queue = queue.slice(1);
      visible = [{ ...next, state: "open" }, ...visible];
      startTimer(next);
    }
  };

  const close = (id: string) => {
    clearTimer(id);
    // Still queued — drop silently.
    const queuedIndex = queue.findIndex((toast) => toast.id === id);
    if (queuedIndex !== -1) {
      queue = queue.filter((toast) => toast.id !== id);
      return;
    }
    const target = visible.find((toast) => toast.id === id);
    if (!target || target.state === "closing") return;
    visible = visible.map((toast) =>
      toast.id === id ? { ...toast, state: "closing" as const } : toast,
    );
    // Promote the next queued toast right away — the closing toast is only
    // animating out and no longer occupies a logical slot.
    promote();
    notify();
    // Safety net in case no Toast.Root finalizes this toast.
    timers.set(
      id,
      setTimeout(() => finalize(id), FINALIZE_FALLBACK_MS),
    );
  };

  const finalize = (id: string) => {
    clearTimer(id);
    const next = visible.filter((toast) => toast.id !== id);
    const changed = next.length !== visible.length;
    visible = next;
    promote();
    if (changed) notify();
  };

  const add = (options: ToastAddOptions) => {
    const id = options.id ?? `toast-${++idCounter}`;

    // Same id — update in place and restart the timer instead of stacking.
    const visibleExisting = visible.find(
      (toast) => toast.id === id && toast.state !== "closing",
    );
    if (visibleExisting) {
      visible = visible.map((toast) =>
        toast.id === id
          ? { ...toast, ...options, id, state: "open" as const }
          : toast,
      );
      startTimer({ ...visibleExisting, ...options, id });
      notify();
      return id;
    }
    const queuedExisting = queue.find((toast) => toast.id === id);
    if (queuedExisting) {
      queue = queue.map((toast) =>
        toast.id === id ? { ...toast, ...options, id } : toast,
      );
      notify();
      return id;
    }

    const toast: ToastObject = { ...options, id, state: "open" };
    if (openCount() < limit) {
      visible = [toast, ...visible];
      startTimer(toast);
    } else {
      queue = [...queue, toast];
    }
    notify();
    return id;
  };

  const update = (id: string, options: Partial<ToastAddOptions>) => {
    visible = visible.map((toast) =>
      toast.id === id ? { ...toast, ...options, id } : toast,
    );
    queue = queue.map((toast) =>
      toast.id === id ? { ...toast, ...options, id } : toast,
    );
    notify();
  };

  return {
    add,
    close,
    finalize,
    update,
    getToasts: () => visible,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};

// ---------------------------------------------------------------------------
// Components

type ToastContextValue = {
  manager: ToastManager;
  toasts: ToastObject[];
};

const ToastContext = createContext<ToastContextValue | null>(null);
const ToastItemContext = createContext<ToastObject | null>(null);

export type ToastViewportPosition =
  "top" | "bottom" | "top-start" | "top-end" | "bottom-start" | "bottom-end";

const ViewportContext = createContext<{ position: ToastViewportPosition }>({
  position: "bottom",
});

export type ToastProviderProps = {
  children?: React.ReactNode;
  /**
   * An external manager created with `createToastManager()`. When omitted the
   * provider creates its own.
   */
  toastManager?: ToastManager;
  /**
   * Default auto-dismiss timeout in ms (used by the internal manager).
   * @default 5000
   */
  timeout?: number;
  /**
   * Maximum number of toasts visible at once (used by the internal manager);
   * additional toasts are queued.
   * @default 1
   */
  limit?: number;
};

export const Provider = ({
  children,
  toastManager,
  timeout,
  limit,
}: ToastProviderProps) => {
  const internal = useRef<ToastManager | null>(null);
  if (!toastManager && internal.current === null) {
    internal.current = createToastManager({ timeout, limit });
  }
  const manager = toastManager ?? internal.current!;
  const toasts = useSyncExternalStore(
    manager.subscribe,
    manager.getToasts,
    manager.getToasts,
  );
  const value = useMemo(() => ({ manager, toasts }), [manager, toasts]);
  return (
    <ToastContext.Provider value={value}>{children}</ToastContext.Provider>
  );
};

/**
 * Returns the toast manager of the nearest `Toast.Provider`:
 * `{ toasts, add, close, update }`.
 */
export const useToastManager = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToastManager must be used inside a <Toast.Provider>");
  }
  return useMemo(
    () => ({
      toasts: context.toasts,
      add: context.manager.add,
      close: context.manager.close,
      update: context.manager.update,
    }),
    [context.toasts, context.manager],
  );
};

export type ToastViewportProps = ViewProps & {
  children?: React.ReactNode;
  /**
   * Which screen region the toasts stack in.
   * @default "bottom"
   */
  position?: ToastViewportPosition;
  style?: StyleProp<ViewStyle>;
};

export const Viewport = ({
  children,
  position = "bottom",
  style,
  ...rest
}: ToastViewportProps) => {
  const context = useMemo(() => ({ position }), [position]);
  const vertical = position.startsWith("top") ? { top: 0 } : { bottom: 0 };
  const alignItems = position.endsWith("-start")
    ? ("flex-start" as const)
    : position.endsWith("-end")
      ? ("flex-end" as const)
      : ("center" as const);
  return (
    <ViewportContext.Provider value={context}>
      <View
        style={[
          {
            pointerEvents: "box-none",
            position: "absolute",
            left: 0,
            right: 0,
            ...vertical,
            alignItems,
            gap: 8,
            padding: 16,
            zIndex: 1000,
          },
          style,
        ]}
        {...rest}
      >
        {children}
      </View>
    </ViewportContext.Provider>
  );
};

export type ToastPresetAnimation = "slide" | "fade" | "zoom" | "none";

export type ToastRootProps = ViewProps & {
  toast: ToastObject;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /**
   * Enter/exit animation preset.
   * @default "slide"
   */
  presetAnimation?: ToastPresetAnimation;
  /**
   * Animation duration in milliseconds.
   * @default 220
   */
  animationDuration?: number;
  /**
   * Swipe the toast horizontally (or toward the nearest screen edge) to
   * dismiss it.
   * @default true
   */
  swipeToDismiss?: boolean;
};

const SWIPE_DISTANCE = 56;
const SWIPE_VELOCITY = 0.5;

export const Root = ({
  toast,
  children,
  style,
  presetAnimation = "slide",
  animationDuration = 220,
  swipeToDismiss = true,
  ...rest
}: ToastRootProps) => {
  const context = useContext(ToastContext);
  const { position } = useContext(ViewportContext);
  const progress = useRef(
    new Animated.Value(presetAnimation === "none" ? 1 : 0),
  ).current;

  // Swipe-to-dismiss gesture. The pan transform lives on an outer wrapper so
  // it composes with the enter/exit animation on the inner view.
  const pan = useRef(new Animated.ValueXY()).current;
  const gestureConfig = useRef({ position, swipeToDismiss, id: toast.id });
  gestureConfig.current = { position, swipeToDismiss, id: toast.id };
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gesture) =>
        gestureConfig.current.swipeToDismiss &&
        (Math.abs(gesture.dx) > 8 || Math.abs(gesture.dy) > 8),
      onPanResponderMove: (_event, gesture) => {
        // Vertical movement is only allowed toward the nearest screen edge.
        const towardsTop = gestureConfig.current.position.startsWith("top");
        const dy = towardsTop
          ? Math.min(gesture.dy, 0)
          : Math.max(gesture.dy, 0);
        pan.setValue({ x: gesture.dx, y: dy });
      },
      onPanResponderRelease: (_event, gesture) => {
        const towardsTop = gestureConfig.current.position.startsWith("top");
        const edgeDy = towardsTop ? -gesture.dy : gesture.dy;
        const edgeVy = towardsTop ? -gesture.vy : gesture.vy;
        const flungX =
          Math.abs(gesture.dx) > SWIPE_DISTANCE ||
          Math.abs(gesture.vx) > SWIPE_VELOCITY;
        const flungY = edgeDy > SWIPE_DISTANCE || edgeVy > SWIPE_VELOCITY;
        if (flungX || flungY) {
          // Fly out along the dominant direction while the standard closing
          // animation fades it; the manager promotes the next queued toast.
          const exit = flungX
            ? { x: gesture.dx < 0 ? -400 : 400, y: gesture.dy }
            : { x: gesture.dx, y: towardsTop ? -200 : 200 };
          Animated.timing(pan, {
            toValue: exit,
            duration: 160,
            useNativeDriver: false,
          }).start();
          context?.manager.close(gestureConfig.current.id);
        } else {
          Animated.spring(pan, {
            toValue: { x: 0, y: 0 },
            useNativeDriver: false,
            bounciness: 6,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(pan, {
          toValue: { x: 0, y: 0 },
          useNativeDriver: false,
          bounciness: 6,
        }).start();
      },
    }),
  ).current;

  // Enter animation on mount.
  useEffect(() => {
    if (presetAnimation === "none") return;
    Animated.timing(progress, {
      toValue: 1,
      duration: animationDuration,
      useNativeDriver: true,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Exit animation when the manager marks this toast as closing.
  const closing = toast.state === "closing";
  useEffect(() => {
    if (!closing) return;
    if (presetAnimation === "none") {
      context?.manager.finalize(toast.id);
      return;
    }
    Animated.timing(progress, {
      toValue: 0,
      duration: animationDuration,
      useNativeDriver: true,
    }).start(() => context?.manager.finalize(toast.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closing]);

  const slideFrom = position.startsWith("top") ? -16 : 16;
  const animatedStyle =
    presetAnimation === "none"
      ? undefined
      : {
          opacity: progress,
          transform: [
            ...(presetAnimation === "slide"
              ? [
                  {
                    translateY: progress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [slideFrom, 0],
                    }),
                  },
                ]
              : []),
            ...(presetAnimation === "zoom"
              ? [
                  {
                    scale: progress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.85, 1],
                    }),
                  },
                ]
              : []),
          ],
        };

  return (
    <ToastItemContext.Provider value={toast}>
      <Animated.View
        {...(swipeToDismiss ? panResponder.panHandlers : {})}
        style={
          {
            transform: [{ translateX: pan.x }, { translateY: pan.y }],
            // Prevent text selection from hijacking mouse drags on web.
            userSelect: "none",
          } as any
        }
      >
        <Animated.View style={[style, animatedStyle]} {...rest}>
          {children}
        </Animated.View>
      </Animated.View>
    </ToastItemContext.Provider>
  );
};

const useToastItem = () => {
  const toast = useContext(ToastItemContext);
  if (!toast) {
    throw new Error("Toast parts must be used inside a <Toast.Root>");
  }
  return toast;
};

export type ToastTextProps = {
  children?: React.ReactNode;
  style?: StyleProp<TextStyle>;
};

export const Title = ({ children, style }: ToastTextProps) => {
  const toast = useToastItem();
  return <RNText style={style}>{children ?? toast.title}</RNText>;
};

export const Description = ({ children, style }: ToastTextProps) => {
  const toast = useToastItem();
  const description = children ?? toast.description;
  if (description == null) return null;
  return <RNText style={style}>{description}</RNText>;
};

export type ToastCloseProps = PressableProps & {
  children?: React.ReactNode;
};

export const Close = ({ children, ...rest }: ToastCloseProps) => {
  const toast = useToastItem();
  const context = useContext(ToastContext);
  return (
    <Pressable
      accessibilityLabel="Close notification"
      {...rest}
      onPress={(event) => {
        context?.manager.close(toast.id);
        rest.onPress?.(event);
      }}
    >
      {children}
    </Pressable>
  );
};

export type ToastActionProps = ToastCloseProps;

/**
 * A button that performs an action and closes the toast.
 */
export const Action = Close;
