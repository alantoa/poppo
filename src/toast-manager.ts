import type { ToastAddOptions, ToastManager, ToastObject } from "./types";

// ---------------------------------------------------------------------------
// A small external store with queue scheduling, mirroring Base UI's
// Toast.createToastManager():
//
// - Every toast is visible by default and they draw as a stack, newest in
//   front. `limit` caps that, and `overflow` says what happens to the next one
//   once the cap is reached: "queue" (default) holds it until a slot frees up;
//   "replace" closes the oldest visible toast so the new one shows at once —
//   the Android Snackbar convention.
// - A toast that a newer one pushes back has its countdown shortened to
//   `demotedTimeout`. Without that, tapping four times means waiting out four
//   full timeouts to see the stack drain; with it the back of the stack
//   clears while the newest toast is still fresh.
// - `add` with an existing `id` UPDATES that toast and restarts its timer —
//   pressing the same button repeatedly refreshes one toast instead of
//   stacking duplicates. It does not demote anything: a refresh is not a new
//   arrival.
// - `close` marks the toast as "closing" so the exit animation can play;
//   `finalize` (called by Toast.Root when the animation ends, with a safety
//   fallback timer) removes it and promotes the next queued toast.
// - Auto-dismiss timers only run while a toast is visible — queued toasts get
//   their full timeout once shown. A timer can be paused: `Toast.Root` holds
//   it while the toast is being touched, dragged or hovered, and
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
   * Maximum number of toasts visible at once; the rest wait per `overflow`.
   * They are drawn as a stack, the newest in front, and by default nothing is
   * held back — the stack just keeps growing.
   * @default Infinity
   */
  limit?: number;
  /**
   * What happens to a new toast when `limit` is reached: `"queue"` shows it
   * once a visible toast goes away; `"replace"` closes the oldest visible
   * toast so the new one shows immediately.
   * @default "queue"
   */
  overflow?: ToastOverflow;
  /**
   * Ceiling, in milliseconds, on how much time a toast has left once a newer
   * one arrives and pushes it back in the stack. It only ever shortens a
   * countdown, so a value at or above `timeout` effectively turns it off.
   * @default 2000
   */
  demotedTimeout?: number;
};

/** A running or paused auto-dismiss countdown. */
type Countdown = {
  handle: ReturnType<typeof setTimeout> | null;
  /** Milliseconds left the last time the countdown was (re)started or paused. */
  remaining: number;
  /** When `handle` was scheduled; meaningless while paused. */
  startedAt: number;
};

/**
 * How many toasts sit in front of `id`: the ones newer than it that are not
 * already leaving. A toast gives up its place in the stack the moment it
 * starts closing, so the ones behind it move forward while it is still fading
 * rather than waiting for it to be removed.
 *
 * `getToasts()` is newest-first, so "in front" means "earlier in the array".
 */
export const stackDepthOf = (toasts: ToastObject[], id: string): number => {
  const self = toasts.findIndex((entry) => entry.id === id);
  if (self <= 0) return 0;
  let ahead = 0;
  for (let i = 0; i < self; i += 1) {
    if (toasts[i]?.state !== "closing") ahead += 1;
  }
  return ahead;
};

/**
 * Where a toast at `depth` is drawn, and whether it is drawn at all.
 *
 * The stack shows `maxVisible` toasts. Deeper ones park in the last visible
 * slot and fade out there rather than climbing further from the edge, so a
 * long run of toasts stays a stack of that many instead of a ladder.
 */
export const stackSlotOf = (
  depth: number,
  maxVisible: number,
): { slot: number; buried: boolean } => ({
  slot: Math.min(depth, Math.max(0, maxVisible - 1)),
  buried: depth >= maxVisible,
});

/**
 * How far from the anchored edge a toast sits once the stack is expanded: past
 * everything in front of it, plus a gap each. Collapsed the toasts overlap and
 * a fixed peek is enough, but expanded they have to clear each other, and only
 * their measured heights know how much room that takes.
 *
 * A toast whose height has not been reported yet contributes nothing, so it
 * lands on the one in front until its first layout arrives.
 */
export const stackOffsetOf = (
  toasts: ToastObject[],
  id: string,
  heights: Record<string, number>,
  gap: number,
): number => {
  const self = toasts.findIndex((entry) => entry.id === id);
  if (self <= 0) return 0;
  let offset = 0;
  for (let i = 0; i < self; i += 1) {
    const entry = toasts[i];
    if (!entry || entry.state === "closing") continue;
    offset += (heights[entry.id] ?? 0) + gap;
  }
  return offset;
};

export const createToastManager = (
  defaults?: ToastManagerOptions,
): ToastManager => {
  const defaultTimeout = defaults?.timeout ?? 5000;
  const limit = Math.max(1, defaults?.limit ?? Number.POSITIVE_INFINITY);
  const overflow: ToastOverflow = defaults?.overflow ?? "queue";
  const demotedTimeout = Math.max(0, defaults?.demotedTimeout ?? 2000);

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

  /**
   * Caps what is left of a countdown. Halting first turns a running countdown
   * into a remaining time, and `run` puts it back only if nothing is holding
   * it — so this is correct whether the toast was counting down or paused.
   * A toast with no countdown at all (`timeout: 0`) is left alone: it was
   * explicitly asked to stay.
   */
  const capRemaining = (id: string, max: number) => {
    const countdown = countdowns.get(id);
    if (!countdown) return;
    halt(id);
    if (countdown.remaining > max) {
      countdown.remaining = max;
    }
    run(id);
  };

  /** Every open toast except the one that just arrived falls back a place. */
  const demoteBehind = (frontId: string) => {
    for (const toast of visible) {
      if (toast.id === frontId || toast.state === "closing") continue;
      capRemaining(toast.id, demotedTimeout);
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
      demoteBehind(next.id);
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
    demoteBehind(id);
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
