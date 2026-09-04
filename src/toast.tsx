import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  AppState,
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
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import {
  supportsWindowPresentation,
  ToastOverlayHost,
} from "./primitives/toast-overlay";
import {
  createToastManager,
  stackDepthOf,
  stackOffsetOf,
  stackSlotOf,
} from "./toast-manager";
import type { ToastOverflow } from "./toast-manager";
import type { ToastManager, ToastObject } from "./types";

export { createToastManager };
export type { ToastManagerOptions, ToastOverflow } from "./toast-manager";

// ---------------------------------------------------------------------------
// Contexts

type ToastContextValue = {
  manager: ToastManager;
  toasts: ToastObject[];
};

const ToastContext = createContext<ToastContextValue | null>(null);
const ToastItemContext = createContext<ToastObject | null>(null);

/**
 * Which viewport is allowed to draw the toasts.
 *
 * More than one can be mounted — and on Android that is the only way to get a
 * toast in front of a `Modal`, whose content lives in a `Dialog` with a window
 * of its own that nothing in the activity's tree can be drawn over. So a
 * viewport inside the modal takes over while it is open, and the one at the
 * root of the app takes back over when it closes.
 *
 * The most recently mounted one wins, *except* that a viewport which owns a
 * window of its own outranks every inline one however late they arrive: it is
 * already above any modal, so handing over to one inside a modal would gain
 * nothing and cost a remount — the toasts would replay their entrance on the
 * way in and again on the way out. That is what keeps the same JSX correct on
 * both platforms: a viewport inside a modal is what Android needs and a no-op
 * on iOS.
 */
type ToastViewportRegistry = {
  claim: (token: object, ownsWindow: boolean) => () => void;
  topmost: object | null;
};

const ViewportRegistryContext = createContext<ToastViewportRegistry>({
  claim: () => () => {},
  topmost: null,
});

export type ToastViewportPosition =
  "top" | "bottom" | "top-start" | "top-end" | "bottom-start" | "bottom-end";

export type ToastViewportPresentation = "inline" | "window";

/**
 * Everything a `Toast.Root` needs to place itself. The viewport resolves it
 * once so each toast can anchor itself against the same edge: the toasts are
 * absolutely positioned and overlap, rather than sharing a flex column, so a
 * toast finishing its exit animation never shifts the ones that remain.
 */
type ToastViewportGeometry = {
  position: ToastViewportPosition;
  towardsTop: boolean;
  alignItems: "flex-start" | "center" | "flex-end";
  /** Distance from the edge the stack is anchored to. */
  edgeMain: number;
  edgeLeft: number;
  edgeRight: number;
  /** Whether a tap on the stack opens it out. */
  expandable: boolean;
  /** Whether it is open right now. */
  expanded: boolean;
  toggleExpanded: () => void;
  /** Room between toasts once the stack is open. */
  expandedGap: number;
  /**
   * Measured heights by toast id. Collapsed the toasts overlap and a fixed
   * peek is enough; expanded they have to clear each other, which only their
   * real heights know how to do.
   */
  heights: Record<string, number>;
  /** `null` forgets the id — a Root reports that as it unmounts. */
  reportHeight: (id: string, height: number | null) => void;
};

/** Space between a toast and the edge it sits against. */
const VIEWPORT_PADDING = 16;

const noop = () => {};

const ViewportContext = createContext<ToastViewportGeometry>({
  position: "bottom",
  towardsTop: false,
  alignItems: "center",
  edgeMain: VIEWPORT_PADDING,
  edgeLeft: VIEWPORT_PADDING,
  edgeRight: VIEWPORT_PADDING,
  expandable: false,
  expanded: false,
  toggleExpanded: noop,
  expandedGap: 12,
  heights: {},
  reportHeight: noop,
});

// ---------------------------------------------------------------------------
// Provider

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
   * They are drawn as a stack, the newest in front; by default nothing is held
   * back and the stack just keeps growing.
   * @default Infinity
   */
  limit?: number;
  /**
   * What happens to a new toast once `limit` is reached (used by the internal
   * manager): `"queue"` shows it when a slot frees up, `"replace"` closes the
   * oldest visible toast so it shows immediately.
   * @default "queue"
   */
  overflow?: ToastOverflow;
  /**
   * Ceiling in ms on how long a toast has left once a newer one pushes it
   * back in the stack (used by the internal manager). It only shortens, so a
   * value at or above `timeout` turns it off.
   * @default 2000
   */
  demotedTimeout?: number;
};

export const Provider = ({
  children,
  toastManager,
  timeout,
  limit,
  overflow,
  demotedTimeout,
}: ToastProviderProps) => {
  const internal = useRef<ToastManager | null>(null);
  if (!toastManager && internal.current === null) {
    internal.current = createToastManager({
      timeout,
      limit,
      overflow,
      demotedTimeout,
    });
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
  const [mounted, setMounted] = useState<
    { token: object; ownsWindow: boolean }[]
  >([]);
  const claim = useCallback((token: object, ownsWindow: boolean) => {
    setMounted((prev) => [...prev, { token, ownsWindow }]);
    return () =>
      setMounted((prev) => prev.filter((entry) => entry.token !== token));
  }, []);
  const registry = useMemo<ToastViewportRegistry>(() => {
    const owning = mounted.filter((entry) => entry.ownsWindow);
    const pool = owning.length > 0 ? owning : mounted;
    return { claim, topmost: pool[pool.length - 1]?.token ?? null };
  }, [claim, mounted]);

  const value = useMemo(() => ({ manager, toasts }), [manager, toasts]);
  return (
    <ToastContext.Provider value={value}>
      <ViewportRegistryContext.Provider value={registry}>
        {children}
      </ViewportRegistryContext.Provider>
    </ToastContext.Provider>
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

// ---------------------------------------------------------------------------
// Viewport

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
   * Extra room to leave at each edge, added to the gap the viewport already
   * keeps.
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
  /**
   * **Experimental.** Off by default, and unverified: on Android a tap has
   * been seen to clear the stack rather than open it. Drive `expanded`
   * yourself if you need this today.
   *
   * Let a tap open the stack out into a list, so the toasts behind the front
   * one can be read and dismissed. What opens out is the stack as drawn —
   * `maxVisible` toasts — not every toast the manager is holding.
   *
   * The tap is only live while more than one toast is up, and every countdown
   * is held while the stack is open.
   *
   * A tap reaches the toast's own children too, so if yours have buttons in
   * them, leave this off and drive `expanded` from wherever you want the
   * trigger to be.
   * @default false
   */
  expandable?: boolean;
  /** Open state, if you would rather own it. */
  expanded?: boolean;
  /** Open state to start from, when you would not. */
  defaultExpanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  /**
   * Room left between toasts once the stack is open.
   * @default 12
   */
  expandedGap?: number;
};

let warnedAboutPresentation = false;

export const Viewport = ({
  children,
  position = "bottom",
  insets,
  style,
  presentation = "inline",
  expandable = false,
  expanded,
  defaultExpanded = false,
  onExpandedChange,
  expandedGap = 12,
  ...rest
}: ToastViewportProps) => {
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

  const registry = useContext(ViewportRegistryContext);
  const token = useRef({}).current;
  useEffect(
    () => registry.claim(token, inWindow),
    [registry.claim, token, inWindow],
  );
  // Before any viewport has claimed — the first render of the only one there
  // is — drawing is the right guess, so a lone viewport never blinks.
  const showing = registry.topmost === null || registry.topmost === token;

  const count = showing ? React.Children.count(children) : 0;

  const [ownExpanded, setOwnExpanded] = useState(defaultExpanded);
  const isExpanded = expanded ?? ownExpanded;
  const setExpanded = useCallback(
    (next: boolean) => {
      if (expanded === undefined) setOwnExpanded(next);
      onExpandedChange?.(next);
    },
    [expanded, onExpandedChange],
  );
  const toggleExpanded = useCallback(
    () => setExpanded(!isExpanded),
    [setExpanded, isExpanded],
  );
  // With one toast left there is nothing to open out, so an open stack that
  // drains down to one closes itself rather than leaving a gap behind.
  useEffect(() => {
    if (isExpanded && count <= 1) setExpanded(false);
  }, [isExpanded, count, setExpanded]);

  const [heights, setHeights] = useState<Record<string, number>>({});
  const reportHeight = useCallback((id: string, height: number | null) => {
    setHeights((prev) => {
      if (height === null) {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      }
      // Layout fires on every pass; only a real change is worth a render.
      if (Math.abs((prev[id] ?? -1) - height) < 1) return prev;
      return { ...prev, [id]: height };
    });
  }, []);

  const towardsTop = position.startsWith("top");
  const geometry = useMemo<ToastViewportGeometry>(
    () => ({
      position,
      towardsTop,
      alignItems: position.endsWith("-start")
        ? "flex-start"
        : position.endsWith("-end")
          ? "flex-end"
          : "center",
      // The spacing lives on each toast rather than as padding on this view:
      // the toasts are absolutely positioned, and an absolute child's insets
      // are measured from the padding box, so padding here would not move
      // them.
      edgeMain:
        VIEWPORT_PADDING + ((towardsTop ? insets?.top : insets?.bottom) ?? 0),
      edgeLeft: VIEWPORT_PADDING + (insets?.left ?? 0),
      edgeRight: VIEWPORT_PADDING + (insets?.right ?? 0),
      expandable,
      expanded: isExpanded,
      toggleExpanded,
      expandedGap,
      heights,
      reportHeight,
    }),
    [
      position,
      towardsTop,
      insets?.top,
      insets?.bottom,
      insets?.left,
      insets?.right,
      expandable,
      isExpanded,
      toggleExpanded,
      expandedGap,
      heights,
      reportHeight,
    ],
  );

  // The viewport fills its container instead of hugging the toasts, so that
  // the box the toasts anchor against never changes size as they come and go.
  // `pointerEvents` stays first so a caller can still override it.
  const containerStyle = [
    inWindow
      ? ({ pointerEvents: "box-none" } as const)
      : ({
          pointerEvents: "box-none",
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 1000,
        } as const),
    style,
  ];

  return (
    <ViewportContext.Provider value={geometry}>
      {!showing ? null : inWindow ? (
        <ToastOverlayHost
          // What the overlay attaches and raises on. Counting the children
          // rather than asking the manager keeps a viewport that renders a
          // subset of the toasts honest.
          toastCount={React.Children.count(children)}
          style={containerStyle}
          {...rest}
        >
          {children}
        </ToastOverlayHost>
      ) : (
        <View style={containerStyle} {...rest}>
          {children}
        </View>
      )}
    </ViewportContext.Provider>
  );
};

// ---------------------------------------------------------------------------
// Root

export type ToastPresetAnimation =
  "spring" | "slide" | "fade" | "zoom" | "none";

export type ToastRootProps = ViewProps & {
  toast: ToastObject;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /**
   * Enter/exit animation preset. `"spring"` rises in from off the edge and
   * settles with a spring; the others are flatter variants of the same
   * machinery.
   * @default "spring"
   */
  presetAnimation?: ToastPresetAnimation;
  /**
   * How long the exit takes, in milliseconds. The entrance is a spring, so it
   * has no duration of its own.
   * @default 160
   */
  animationDuration?: number;
  /**
   * Drag the toast away to dismiss it: sideways in either direction, or
   * toward its own edge. Only the front toast takes the gesture — the ones
   * behind it are covered.
   * @default true
   */
  swipeToDismiss?: boolean;
  /**
   * How much of each toast behind this one peeks out past it.
   * @default 14
   */
  stackPeek?: number;
  /**
   * How much smaller each toast behind this one is drawn.
   * @default 0.05
   */
  stackScaleStep?: number;
  /**
   * How many toasts the stack shows. Deeper ones fade out where the last
   * visible one sits rather than climbing further up the screen, so a long
   * run of toasts stays a stack of this many instead of a ladder.
   * @default 3
   */
  maxVisible?: number;
};

/** Past this, a release is a dismissal rather than a nudge. */
const DISMISS_DISTANCE = 56;
/** Points per second — gesture-handler reports velocity per second. */
const DISMISS_VELOCITY = 800;
/** How far outside its edge a toast starts, before the spring pulls it in. */
const ENTER_OFFSET = 200;
/** How small it starts. */
const HIDDEN_SCALE = 0.7;
const FADE_IN_MS = 200;
/** A toast on its way out sinks a little as it fades. */
const EXIT_DROP = 40;
/** Swiping it out follows the finger further. */
const SWIPE_EXIT_DROP = 80;
/** How far a drag against the dismiss direction can get. */
const RUBBER_BAND = 48;
/** How far a toast swiped sideways is thrown before it is gone. */
const FLING_X = 400;
/** Front toast paints over the ones behind it. */
const STACK_Z = 1000;

const STACK_SPRING = { damping: 22, stiffness: 220, mass: 0.7 } as const;
const SETTLE_SPRING = { damping: 18, stiffness: 200, mass: 0.6 } as const;

/**
 * Resistance for a drag heading the wrong way: asymptotes at `limit`, so the
 * toast gives a little and then stops rather than following the finger.
 */
const resist = (offset: number, limit: number) => {
  "worklet";
  return offset / (1 + Math.abs(offset) / limit);
};

/** Enter offset and scale per preset; the exit is the same for all of them. */
const PRESETS: Record<ToastPresetAnimation, { offset: number; scale: number }> =
  {
    spring: { offset: ENTER_OFFSET, scale: HIDDEN_SCALE },
    slide: { offset: 16, scale: 1 },
    zoom: { offset: 0, scale: 0.85 },
    fade: { offset: 0, scale: 1 },
    none: { offset: 0, scale: 1 },
  };

export const Root = ({
  toast,
  children,
  style,
  presetAnimation = "spring",
  animationDuration = 160,
  swipeToDismiss = true,
  stackPeek = 14,
  stackScaleStep = 0.05,
  maxVisible = 3,
  ...rest
}: ToastRootProps) => {
  const context = useContext(ToastContext);
  const {
    towardsTop,
    alignItems,
    edgeMain,
    edgeLeft,
    edgeRight,
    expandable,
    expanded,
    toggleExpanded,
    expandedGap,
    heights,
    reportHeight,
  } = useContext(ViewportContext);
  const toasts = context?.toasts;

  // Which way is "away from the edge the stack is anchored to". Everything
  // directional below is written once, in terms of this.
  const dir = towardsTop ? -1 : 1;

  // Depth counts the toasts in front of this one that are *not* leaving. A
  // toast starts its exit the moment `close` runs, and from that moment it
  // holds no place in the stack — so the ones behind it spring forward while
  // it is still fading, instead of waiting for it to be removed.
  const depth = useMemo(
    () => (toasts ? stackDepthOf(toasts, toast.id) : 0),
    [toasts, toast.id],
  );
  const closing = toast.state === "closing";
  const isFront = depth === 0;

  // Everything below runs on the UI thread: the drag tracks the finger without
  // a round trip through JS, and a busy JS thread cannot stutter it.
  const progress = useSharedValue(presetAnimation === "none" ? 1 : 0);
  const opacity = useSharedValue(presetAnimation === "none" ? 1 : 0);
  const exitDrop = useSharedValue(0);
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  // Where this toast sits once the stack is open: past everything in front of
  // it. Collapsed, `slot` and a fixed peek are all it takes.
  const expandedOffset = useMemo(
    () => (toasts ? stackOffsetOf(toasts, toast.id, heights, expandedGap) : 0),
    [toasts, toast.id, heights, expandedGap],
  );
  const liveCount = useMemo(
    () =>
      toasts?.reduce(
        (n, entry) => (entry.state === "closing" ? n : n + 1),
        0,
      ) ?? 0,
    [toasts],
  );

  const { slot, buried } = stackSlotOf(depth, maxVisible);
  const stackDepth = useSharedValue(slot);
  const stackOpacity = useSharedValue(buried ? 0 : 1);
  const expansion = useSharedValue(expanded ? 1 : 0);
  const expandedY = useSharedValue(expandedOffset);
  /**
   * Which axis carried the dismissal, so the exit knows how to see it out:
   * 0 nothing (a timeout or the close button), 1 sideways, 2 toward the edge.
   */
  const swipedAxis = useSharedValue(0);

  // Worklets need stable callables, so the changing closures live in one ref
  // and these thin wrappers are what `runOnJS` sees.
  const actions = useRef({
    hold: (_kind: "touch" | "hover" | "expand", _active: boolean) => {},
    close: () => {},
    finalize: () => {},
    toggle: () => {},
  });

  // The countdown is held while the toast is under a finger (or, on web, a
  // hovering mouse) so it cannot vanish mid-interaction. Touch and hover are
  // tracked separately and the manager is only told about the combined state,
  // so lifting a finger does not resume a toast that is still hovered.
  const holds = useRef({ touch: false, hover: false, expand: false });
  const anyHold = () =>
    holds.current.touch || holds.current.hover || holds.current.expand;
  actions.current.hold = (kind, active) => {
    const before = anyHold();
    holds.current[kind] = active;
    const after = anyHold();
    if (before === after) return;
    if (after) context?.manager.pause(toast.id);
    else context?.manager.resume(toast.id);
  };
  actions.current.close = () => context?.manager.close(toast.id);
  actions.current.finalize = () => context?.manager.finalize(toast.id);
  actions.current.toggle = () => toggleExpanded();

  const holdTouch = useCallback(
    (active: boolean) => actions.current.hold("touch", active),
    [],
  );
  const closeSelf = useCallback(() => actions.current.close(), []);
  const finalizeSelf = useCallback(() => actions.current.finalize(), []);
  const toggleStack = useCallback(() => actions.current.toggle(), []);

  // A Root taken down mid-touch (its viewport unmounting under a finger) would
  // otherwise leave its id held for good — and ids are reused.
  useEffect(
    () => () => {
      actions.current.hold("touch", false);
      actions.current.hold("hover", false);
      actions.current.hold("expand", false);
      reportHeight(toast.id, null);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // An open stack is being read, so nothing in it should time out underneath
  // the reader.
  useEffect(() => {
    actions.current.hold("expand", expanded);
  }, [expanded]);

  // One effect for both directions: entering on mount, leaving when the
  // manager marks the toast closing — and entering again if the same id is
  // re-added while that exit animation is still running.
  useEffect(() => {
    if (presetAnimation === "none") {
      if (closing) finalizeSelf();
      return;
    }
    if (closing) {
      // The exit does not run the entrance backwards: it fades and sinks on a
      // fixed curve, so a toast dismissed mid-spring still leaves cleanly. A
      // toast swiped sideways is already on its way out along X, so it does
      // not sink as well.
      const axis = swipedAxis.value;
      const drop =
        !isFront || axis === 1 ? 0 : axis === 2 ? SWIPE_EXIT_DROP : EXIT_DROP;
      const timing = {
        duration: animationDuration,
        easing: Easing.bezier(0.23, 1, 0.32, 1),
      };
      exitDrop.value = withTiming(dir * drop, timing);
      opacity.value = withTiming(0, timing, (finished) => {
        "worklet";
        // An interrupted exit means the toast came back; leave it alone.
        if (finished) runOnJS(finalizeSelf)();
      });
      return;
    }
    swipedAxis.value = 0;
    exitDrop.value = withTiming(0, { duration: animationDuration });
    dragX.value = withSpring(0, SETTLE_SPRING);
    dragY.value = withSpring(0, SETTLE_SPRING);
    opacity.value = withTiming(1, { duration: FADE_IN_MS });
    progress.value = withSpring(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closing]);

  // Moving forward in the stack is a spring, so a toast leaving the front
  // hands its place over rather than snapping.
  useEffect(() => {
    stackDepth.value = withSpring(slot, STACK_SPRING);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot]);

  // Falling past the last visible slot is a fade, not a move. Opening the
  // stack does not bring it back: what opens out is the stack you can see, so
  // the same `maxVisible` toasts are on screen either way.
  useEffect(() => {
    stackOpacity.value = withTiming(buried ? 0 : 1, { duration: FADE_IN_MS });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buried]);

  // Opening and closing the stack, and keeping the open layout up to date as
  // toasts come and go, are both springs.
  useEffect(() => {
    expansion.value = withSpring(expanded ? 1 : 0, STACK_SPRING);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  useEffect(() => {
    expandedY.value = withSpring(expandedOffset, STACK_SPRING);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedOffset]);

  const enter = PRESETS[presetAnimation];
  const animated = useAnimatedStyle(() => {
    const p = progress.value;
    const d = stackDepth.value;
    const e = expansion.value;
    return {
      opacity: opacity.value * stackOpacity.value,
      transform: [
        { translateX: dragX.value },
        {
          translateY:
            // Still coming in, placed by the stack — a peek back when closed,
            // clear of the ones in front when open — dragged, sinking out.
            (1 - p) * enter.offset * dir +
            (-d * stackPeek * (1 - e) - expandedY.value * e) * dir +
            dragY.value +
            exitDrop.value,
        },
        {
          scale:
            (enter.scale + (1 - enter.scale) * p) *
            // Open, every toast is drawn at its own size.
            (1 - d * stackScaleStep * (1 - e)),
        },
      ],
    };
  });

  const pan = Gesture.Pan()
    // Collapsed, only the toast in front is reachable — the rest are covered.
    // Open, every toast the stack shows is; the ones the cap hid still are not.
    .enabled(swipeToDismiss && (isFront || (expanded && !buried)) && !closing)
    .minDistance(8)
    // Touch down, before the pan has claimed the gesture: a plain press on a
    // button inside the toast has to hold the countdown too.
    .onBegin(() => {
      runOnJS(holdTouch)(true);
    })
    .onUpdate((event) => {
      // Sideways is a dismissal either way, so the toast just follows the
      // finger. Vertically only its own edge is a way out: the other way it
      // gives a little and stops.
      dragX.value = event.translationX;
      const towardEdge = event.translationY * dir;
      dragY.value =
        dir * (towardEdge >= 0 ? towardEdge : resist(towardEdge, RUBBER_BAND));
    })
    .onEnd((event) => {
      const sideways = Math.abs(event.translationX);
      const towardEdge = event.translationY * dir;
      const flungX =
        sideways > DISMISS_DISTANCE ||
        Math.abs(event.velocityX) > DISMISS_VELOCITY;
      const flungY =
        towardEdge > DISMISS_DISTANCE ||
        event.velocityY * dir > DISMISS_VELOCITY;
      // Both at once happens on a diagonal flick; the axis the finger
      // actually travelled further along is the one that wins.
      if (flungX && (!flungY || sideways > towardEdge)) {
        swipedAxis.value = 1;
        dragX.value = withTiming(event.translationX < 0 ? -FLING_X : FLING_X, {
          duration: animationDuration,
        });
        dragY.value = withSpring(0, SETTLE_SPRING);
        runOnJS(closeSelf)();
      } else if (flungY) {
        swipedAxis.value = 2;
        dragX.value = withSpring(0, SETTLE_SPRING);
        runOnJS(closeSelf)();
      } else {
        dragX.value = withSpring(0, SETTLE_SPRING);
        dragY.value = withSpring(0, SETTLE_SPRING);
      }
    })
    .onFinalize(() => {
      runOnJS(holdTouch)(false);
    });

  // A tap only means "open the stack" when there is a stack to open. Pan wins
  // the pair, so a drag never doubles as a tap.
  const tap = Gesture.Tap()
    .enabled(expandable && liveCount > 1 && !closing)
    .maxDuration(300)
    .onEnd((_event, success) => {
      if (success) runOnJS(toggleStack)();
    });
  const gesture = Gesture.Exclusive(pan, tap);

  const hoverHandlers =
    Platform.OS === "web"
      ? {
          onMouseEnter: () => actions.current.hold("hover", true),
          onMouseLeave: () => actions.current.hold("hover", false),
        }
      : null;

  return (
    <ToastItemContext.Provider value={toast}>
      <GestureDetector gesture={gesture}>
        <Animated.View
          {...hoverHandlers}
          onLayout={(event) =>
            reportHeight(toast.id, event.nativeEvent.layout.height)
          }
          style={[
            {
              position: "absolute",
              left: edgeLeft,
              right: edgeRight,
              ...(towardsTop ? { top: edgeMain } : { bottom: edgeMain }),
              alignItems,
              zIndex: STACK_Z - depth,
              // Scaling a card in a stack has to keep the edge it is anchored
              // to still; the default centre origin would drift it.
              transformOrigin: towardsTop ? "50% 0%" : "50% 100%",
              // Prevent text selection from hijacking mouse drags on web.
              // `userSelect` is web-only and absent from RN's ViewStyle.
              ...(Platform.OS === "web" ? { userSelect: "none" } : null),
            } as unknown as ViewStyle,
            animated,
          ]}
        >
          <View style={style} {...rest}>
            {children}
          </View>
        </Animated.View>
      </GestureDetector>
    </ToastItemContext.Provider>
  );
};

// ---------------------------------------------------------------------------
// Parts

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
