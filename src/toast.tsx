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
  AppState,
  PanResponder,
  Platform,
  Pressable,
  Text as RNText,
  View,
  type PressableProps,
  type StyleProp,
  type TextStyle,
  type ViewProps,
  type ViewStyle,
} from "react-native";

import {
  supportsWindowPresentation,
  ToastOverlayHost,
} from "./primitives/toast-overlay";
import type { ToastAddOptions, ToastManager, ToastObject } from "./types";

// ---------------------------------------------------------------------------
// Manager — a small external store with queue scheduling, mirroring Base UI's
// Toast.createToastManager():
//
// - At most `limit` toasts are visible at once (default 1). What happens to
//   the next one is `overflow`: "queue" (default) holds it until a slot frees
//   up; "replace" closes the oldest visible toast so the new one shows at
//   once — the Android Snackbar convention, and usually what a phone wants.
// - `add` with an existing `id` UPDATES that toast and restarts its timer —
//   pressing the same button repeatedly refreshes one toast instead of
//   stacking duplicates.
// - `close` marks the toast as "closing" so the exit animation can play;
//   `finalize` (called by Toast.Root when the animation ends, with a safety
//   fallback timer) removes it and promotes the next queued toast.
// - Auto-dismiss timers only run while a toast is visible — queued toasts
//   get their full timeout once shown. A timer can be paused: `Toast.Root`
//   holds it while the toast is being touched, dragged or hovered, and
//   `Toast.Provider` suspends all of them while the app is in the background,
//   so a toast never expires under a finger or while nobody can see it.

let idCounter = 0;

// Safety net: if no Toast.Root is rendered for a closing toast (so nothing
// calls finalize), remove it anyway after the exit animation should have
// long finished.
const FINALIZE_FALLBACK_MS = 600;

export type ToastOverflow = "queue" | "replace";

export type ToastManagerOptions = {
  /**
   * Default auto-dismiss timeout in milliseconds. 0 disables auto-dismiss.
   * @default 5000
   */
  timeout?: number;
  /**
   * Maximum number of toasts visible at once.
   * @default 1
   */
  limit?: number;
  /**
   * What happens to a new toast when `limit` is reached: `"queue"` shows it
   * once a visible toast goes away; `"replace"` closes the oldest visible
   * toast so the new one shows immediately.
   * @default "queue"
   */
  overflow?: ToastOverflow;
};

/** A running or paused auto-dismiss countdown. */
type Countdown = {
  handle: ReturnType<typeof setTimeout> | null;
  /** Milliseconds left the last time the countdown was (re)started or paused. */
  remaining: number;
  /** When `handle` was scheduled; meaningless while paused. */
  startedAt: number;
};

export const createToastManager = (
  defaults?: ToastManagerOptions,
): ToastManager => {
  const defaultTimeout = defaults?.timeout ?? 5000;
  const limit = Math.max(1, defaults?.limit ?? 1);
  const overflow: ToastOverflow = defaults?.overflow ?? "queue";

  let visible: ToastObject[] = [];
  let queue: ToastObject[] = [];
  const listeners = new Set<() => void>();
  const countdowns = new Map<string, Countdown>();
  const fallbacks = new Map<string, ReturnType<typeof setTimeout>>();
  /** Toasts whose countdown is held by an interaction (`pause`). */
  const held = new Set<string>();
  /** Every countdown is held (`pauseAll`) — the app is in the background. */
  let suspended = false;

  const notify = () => listeners.forEach((listener) => listener());

  // Schedules the countdown unless something is holding it. Idempotent.
  const run = (id: string) => {
    const countdown = countdowns.get(id);
    if (!countdown || countdown.handle || held.has(id) || suspended) return;
    countdown.startedAt = Date.now();
    countdown.handle = setTimeout(() => {
      countdowns.delete(id);
      close(id);
    }, countdown.remaining);
  };

  // Unschedules the countdown, remembering how much was left. Idempotent.
  const halt = (id: string) => {
    const countdown = countdowns.get(id);
    if (!countdown?.handle) return;
    clearTimeout(countdown.handle);
    countdown.handle = null;
    countdown.remaining = Math.max(
      0,
      countdown.remaining - (Date.now() - countdown.startedAt),
    );
  };

  const stopTimer = (id: string) => {
    halt(id);
    countdowns.delete(id);
  };

  const startTimer = (toast: ToastObject) => {
    stopTimer(toast.id);
    const dismissAfter = toast.timeout ?? defaultTimeout;
    if (dismissAfter > 0) {
      countdowns.set(toast.id, {
        handle: null,
        remaining: dismissAfter,
        startedAt: 0,
      });
      run(toast.id);
    }
  };

  const clearFallback = (id: string) => {
    const fallback = fallbacks.get(id);
    if (fallback) {
      clearTimeout(fallback);
      fallbacks.delete(id);
    }
  };

  const openToasts = () => visible.filter((toast) => toast.state !== "closing");

  const promote = () => {
    while (queue.length > 0 && openToasts().length < limit) {
      const next = queue[0] as ToastObject;
      queue = queue.slice(1);
      visible = [{ ...next, state: "open" }, ...visible];
      startTimer(next);
    }
  };

  const close = (id: string) => {
    stopTimer(id);
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
    clearFallback(id);
    fallbacks.set(
      id,
      setTimeout(() => finalize(id), FINALIZE_FALLBACK_MS),
    );
  };

  const finalize = (id: string) => {
    stopTimer(id);
    clearFallback(id);
    held.delete(id);
    const next = visible.filter((toast) => toast.id !== id);
    const changed = next.length !== visible.length;
    visible = next;
    promote();
    if (changed) notify();
  };

  const add = (options: ToastAddOptions) => {
    const id = options.id ?? `toast-${++idCounter}`;

    // Same id — update in place and restart the timer instead of stacking.
    // Closing entries count: one that is still playing its exit animation is
    // brought back rather than duplicated. Appending instead would leave two
    // entries sharing an id, and `finalize` filters by id, so the old one
    // finishing its animation would take the new one with it.
    const visibleExisting = visible.find((toast) => toast.id === id);
    if (visibleExisting) {
      clearFallback(id);
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
    const open = openToasts();
    if (open.length >= limit) {
      if (overflow === "queue") {
        queue = [...queue, toast];
        notify();
        return id;
      }
      // "replace": the oldest open toast makes room. `visible` is newest
      // first, so that is the last open entry.
      close((open[open.length - 1] as ToastObject).id);
    }
    visible = [toast, ...visible];
    startTimer(toast);
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

  const pause = (id: string) => {
    held.add(id);
    halt(id);
  };

  const resume = (id: string) => {
    held.delete(id);
    run(id);
  };

  const pauseAll = () => {
    suspended = true;
    countdowns.forEach((_, id) => halt(id));
  };

  const resumeAll = () => {
    suspended = false;
    countdowns.forEach((_, id) => run(id));
  };

  return {
    add,
    close,
    finalize,
    update,
    pause,
    resume,
    pauseAll,
    resumeAll,
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
   * Maximum number of toasts visible at once (used by the internal manager).
   * @default 1
   */
  limit?: number;
  /**
   * What happens to a new toast once `limit` is reached (used by the internal
   * manager): `"queue"` shows it when a slot frees up, `"replace"` closes the
   * oldest visible toast so it shows immediately.
   * @default "queue"
   */
  overflow?: ToastOverflow;
};

export const Provider = ({
  children,
  toastManager,
  timeout,
  limit,
  overflow,
}: ToastProviderProps) => {
  const internal = useRef<ToastManager | null>(null);
  if (!toastManager && internal.current === null) {
    internal.current = createToastManager({ timeout, limit, overflow });
  }
  const manager = toastManager ?? internal.current!;
  const toasts = useSyncExternalStore(
    manager.subscribe,
    manager.getToasts,
    manager.getToasts,
  );
  // A toast should not spend its timeout while the app is not on screen.
  // "inactive" (app switcher, control centre, an incoming call) counts too.
  // On web `AppState` is backed by `visibilitychange`, so a hidden tab pauses
  // as well.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") manager.resumeAll();
      else manager.pauseAll();
    });
    return () => subscription.remove();
  }, [manager]);
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

export type ToastViewportEdgeInsets = {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
};

export type ToastViewportProps = ViewProps & {
  children?: React.ReactNode;
  /**
   * Which screen region the toasts stack in.
   * @default "bottom"
   */
  position?: ToastViewportPosition;
  /**
   * Extra room to leave at each edge, added to the viewport's own padding.
   *
   * Nothing here knows about safe areas or a tab bar — that is the app's to
   * know, and taking a dependency on it would not be this library's call. Pass
   * what you already have:
   *
   * ```tsx
   * <Toast.Viewport insets={useSafeAreaInsets()} />
   * <Toast.Viewport insets={{ bottom: useBottomTabBarHeight() }} />
   * ```
   */
  insets?: ToastViewportEdgeInsets;
  style?: StyleProp<ViewStyle>;
  /**
   * Where the viewport renders.
   *
   * - `"inline"` (default) — an absolutely positioned view in the React tree,
   *   bounded by its parent, like any other view.
   * - `"window"` — **iOS only.** An overlay on the window itself, so a toast
   *   is not clipped by an ancestor and is raised above an open `Modal`.
   *   Because the overlay *is* the window, `position` measures from the screen
   *   edges rather than from this component's parent. Falls back to `"inline"`
   *   on Android and web.
   */
  presentation?: ToastViewportPresentation;
};

export type ToastViewportPresentation = "inline" | "window";

/** Space between a toast and the edge it sits against. */
const VIEWPORT_PADDING = 16;

let warnedAboutPresentation = false;

export const Viewport = ({
  children,
  position = "bottom",
  insets,
  style,
  presentation = "inline",
  ...rest
}: ToastViewportProps) => {
  const context = useMemo(() => ({ position }), [position]);
  const inWindow = presentation === "window" && supportsWindowPresentation;
  if (
    __DEV__ &&
    presentation === "window" &&
    !supportsWindowPresentation &&
    !warnedAboutPresentation
  ) {
    warnedAboutPresentation = true;
    console.warn(
      '[poppo] <Toast.Viewport presentation="window" /> is iOS-only; ' +
        'falling back to "inline".',
    );
  }
  // Only the edges actually asked for are written, so a caller overriding
  // `padding` wholesale through `style` still works when there are no insets.
  const insetStyle = useMemo(
    () => ({
      ...(insets?.top ? { paddingTop: VIEWPORT_PADDING + insets.top } : null),
      ...(insets?.bottom
        ? { paddingBottom: VIEWPORT_PADDING + insets.bottom }
        : null),
      ...(insets?.left
        ? { paddingLeft: VIEWPORT_PADDING + insets.left }
        : null),
      ...(insets?.right
        ? { paddingRight: VIEWPORT_PADDING + insets.right }
        : null),
    }),
    [insets?.top, insets?.bottom, insets?.left, insets?.right],
  );
  const alignItems = position.endsWith("-start")
    ? ("flex-start" as const)
    : position.endsWith("-end")
      ? ("flex-end" as const)
      : ("center" as const);
  // The window overlay is already the size of the screen, so the edge the
  // toasts sit against is a justification inside it rather than a pinned side.
  // `pointerEvents` stays first so a caller can still override it.
  const layout = inWindow
    ? ({
        pointerEvents: "box-none",
        justifyContent: position.startsWith("top")
          ? ("flex-start" as const)
          : ("flex-end" as const),
        alignItems,
        gap: 8,
        padding: VIEWPORT_PADDING,
      } as const)
    : ({
        pointerEvents: "box-none",
        position: "absolute",
        left: 0,
        right: 0,
        ...(position.startsWith("top") ? { top: 0 } : { bottom: 0 }),
        alignItems,
        gap: 8,
        padding: VIEWPORT_PADDING,
        zIndex: 1000,
      } as const);
  const viewportStyle = [layout, insetStyle, style];
  return (
    <ViewportContext.Provider value={context}>
      {inWindow ? (
        <ToastOverlayHost
          // What the overlay attaches and raises on. Counting the children
          // rather than asking the manager keeps a viewport that renders a
          // subset of the toasts honest.
          toastCount={React.Children.count(children)}
          style={viewportStyle}
          {...rest}
        >
          {children}
        </ToastOverlayHost>
      ) : (
        <View style={viewportStyle} {...rest}>
          {children}
        </View>
      )}
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
  // The countdown is held while the toast is under a finger (or, on web, a
  // hovering or dragging mouse) so it cannot vanish mid-interaction. Touch
  // and hover are tracked separately and the manager is only told about the
  // combined state, so lifting a finger does not resume a toast that is still
  // hovered. Raw `onTouch*` rather than the responder callbacks: those only
  // fire once the pan takes over, but a plain press on a child button must
  // hold the timer too. The responder's grant/release cover the web mouse,
  // which fires no touch events.
  const holds = useRef({ touch: false, hover: false });
  const hold = (kind: "touch" | "hover", active: boolean) => {
    const before = holds.current.touch || holds.current.hover;
    holds.current[kind] = active;
    const after = holds.current.touch || holds.current.hover;
    if (before === after) return;
    if (after) context?.manager.pause(gestureConfig.current.id);
    else context?.manager.resume(gestureConfig.current.id);
  };
  const holdRef = useRef(hold);
  holdRef.current = hold;
  // A Root taken down mid-touch (its viewport unmounting under a finger)
  // would otherwise leave its id held for good — and ids are reused.
  useEffect(
    () => () => {
      holdRef.current("touch", false);
      holdRef.current("hover", false);
    },
    [],
  );

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gesture) =>
        gestureConfig.current.swipeToDismiss &&
        (Math.abs(gesture.dx) > 8 || Math.abs(gesture.dy) > 8),
      onPanResponderGrant: () => holdRef.current("touch", true),
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
        holdRef.current("touch", false);
      },
      onPanResponderTerminate: () => {
        Animated.spring(pan, {
          toValue: { x: 0, y: 0 },
          useNativeDriver: false,
          bounciness: 6,
        }).start();
        holdRef.current("touch", false);
      },
    }),
  ).current;

  const interactionHandlers = {
    onTouchStart: () => holdRef.current("touch", true),
    onTouchEnd: () => holdRef.current("touch", false),
    onTouchCancel: () => holdRef.current("touch", false),
    ...(Platform.OS === "web"
      ? {
          onMouseEnter: () => holdRef.current("hover", true),
          onMouseLeave: () => holdRef.current("hover", false),
        }
      : null),
  };

  // One effect for both directions: entering on mount, leaving when the
  // manager marks the toast closing — and entering again if the same id is
  // re-added while that exit animation is still running.
  const closing = toast.state === "closing";
  useEffect(() => {
    if (!closing) {
      pan.setValue({ x: 0, y: 0 });
    }
    if (presetAnimation === "none") {
      if (closing) context?.manager.finalize(toast.id);
      return;
    }
    Animated.timing(progress, {
      toValue: closing ? 0 : 1,
      duration: animationDuration,
      useNativeDriver: true,
    }).start(({ finished }) => {
      // An interrupted exit means the toast came back; leave it alone.
      if (closing && finished) context?.manager.finalize(toast.id);
    });
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
        {...interactionHandlers}
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
