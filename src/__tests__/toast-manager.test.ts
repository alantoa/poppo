import {
  createToastManager,
  stackDepthOf,
  stackOffsetOf,
  stackSlotOf,
} from "../toast-manager";
import type { ToastObject } from "../types";

// The manager is plain JS driven by setTimeout, so the whole schedule can be
// exercised with fake timers. `Date.now` is faked too — the pause bookkeeping
// reads it to work out how much of a countdown is left.
//
// It lives apart from `toast.tsx` precisely so this suite needs no mocks: the
// components there pull in react-native, reanimated and gesture-handler, none
// of which this file has any use for.
const ids = (manager: ReturnType<typeof createToastManager>) =>
  manager.getToasts().map((toast) => `${toast.id}:${toast.state}`);

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("overflow: queue (default)", () => {
  it("holds the second toast until the first is finalized", () => {
    const manager = createToastManager({ timeout: 1000, limit: 1 });
    manager.add({ id: "a" });
    manager.add({ id: "b" });
    expect(ids(manager)).toEqual(["a:open"]);

    jest.advanceTimersByTime(1000);
    // `a` is animating out, `b` already occupies the logical slot.
    expect(ids(manager)).toEqual(["b:open", "a:closing"]);

    manager.finalize("a");
    expect(ids(manager)).toEqual(["b:open"]);
  });

  it("gives a queued toast its full timeout once shown", () => {
    const manager = createToastManager({ timeout: 1000, limit: 1 });
    manager.add({ id: "a" });
    manager.add({ id: "b" });
    jest.advanceTimersByTime(1000);
    manager.finalize("a");

    jest.advanceTimersByTime(999);
    expect(ids(manager)).toEqual(["b:open"]);
    jest.advanceTimersByTime(1);
    expect(ids(manager)).toEqual(["b:closing"]);
  });

  it("re-adding a visible id updates it and restarts its timer", () => {
    const manager = createToastManager({ timeout: 1000, limit: 1 });
    manager.add({ id: "a", title: "one" });
    jest.advanceTimersByTime(800);
    manager.add({ id: "a", title: "two" });
    expect(manager.getToasts()).toEqual([
      { id: "a", title: "two", state: "open" },
    ]);

    jest.advanceTimersByTime(999);
    expect(ids(manager)).toEqual(["a:open"]);
    jest.advanceTimersByTime(1);
    expect(ids(manager)).toEqual(["a:closing"]);
  });

  it("re-adding a closing id brings it back and cancels the fallback removal", () => {
    const manager = createToastManager({ timeout: 1000, limit: 1 });
    manager.add({ id: "a" });
    manager.close("a");
    expect(ids(manager)).toEqual(["a:closing"]);

    manager.add({ id: "a" });
    expect(ids(manager)).toEqual(["a:open"]);
    jest.advanceTimersByTime(999);
    expect(ids(manager)).toEqual(["a:open"]);
    jest.advanceTimersByTime(1);
    expect(ids(manager)).toEqual(["a:closing"]);
  });

  it("closing an id that is still queued drops it silently", () => {
    const manager = createToastManager({ timeout: 1000, limit: 1 });
    manager.add({ id: "a" });
    manager.add({ id: "b" });
    manager.close("b");
    jest.advanceTimersByTime(1000);
    manager.finalize("a");
    expect(ids(manager)).toEqual([]);
  });

  it("removes a closing toast nobody finalizes, and promotes", () => {
    const manager = createToastManager({ timeout: 1000, limit: 1 });
    manager.add({ id: "a" });
    manager.add({ id: "b" });
    manager.add({ id: "c" });
    manager.close("a");
    expect(ids(manager)).toEqual(["b:open", "a:closing"]);
    jest.advanceTimersByTime(600);
    expect(ids(manager)).toEqual(["b:open"]);
  });
});

describe("overflow: replace", () => {
  it("closes the oldest visible toast so the new one shows at once", () => {
    const manager = createToastManager({
      timeout: 1000,
      limit: 1,
      overflow: "replace",
    });
    manager.add({ id: "a" });
    manager.add({ id: "b" });
    expect(ids(manager)).toEqual(["b:open", "a:closing"]);

    manager.finalize("a");
    expect(ids(manager)).toEqual(["b:open"]);
  });

  it("never queues — a burst leaves only the newest", () => {
    const manager = createToastManager({
      timeout: 1000,
      limit: 1,
      overflow: "replace",
    });
    for (const id of ["a", "b", "c", "d"]) manager.add({ id });
    // Closing entries are still mounted for their exit animation.
    expect(ids(manager)).toEqual([
      "d:open",
      "c:closing",
      "b:closing",
      "a:closing",
    ]);
    jest.advanceTimersByTime(600);
    expect(ids(manager)).toEqual(["d:open"]);
    // `d` was not shortened by replacing the others: its full second runs.
    jest.advanceTimersByTime(400);
    expect(ids(manager)).toEqual(["d:closing"]);
  });

  it("respects a limit above one", () => {
    const manager = createToastManager({
      timeout: 1000,
      limit: 2,
      overflow: "replace",
    });
    manager.add({ id: "a" });
    manager.add({ id: "b" });
    expect(ids(manager)).toEqual(["b:open", "a:open"]);
    manager.add({ id: "c" });
    expect(ids(manager)).toEqual(["c:open", "b:open", "a:closing"]);
  });
});

describe("demoting", () => {
  it("shortens what an older toast has left when a newer one arrives", () => {
    const manager = createToastManager({
      timeout: 10_000,
      limit: 3,
      demotedTimeout: 2000,
    });
    manager.add({ id: "a" });
    jest.advanceTimersByTime(500);
    manager.add({ id: "b" });

    // `a` had 9.5s left and is now capped at 2s.
    jest.advanceTimersByTime(1999);
    expect(ids(manager)).toEqual(["b:open", "a:open"]);
    jest.advanceTimersByTime(1);
    expect(ids(manager)).toEqual(["b:open", "a:closing"]);
  });

  it("never extends a countdown that is already shorter", () => {
    const manager = createToastManager({
      timeout: 800,
      limit: 3,
      demotedTimeout: 2000,
    });
    manager.add({ id: "a" });
    manager.add({ id: "b" });
    jest.advanceTimersByTime(800);
    expect(ids(manager)).toEqual(["b:closing", "a:closing"]);
  });

  it("leaves a toast that asked to stay alone", () => {
    const manager = createToastManager({
      timeout: 10_000,
      limit: 3,
      demotedTimeout: 100,
    });
    manager.add({ id: "sticky", timeout: 0 });
    manager.add({ id: "b" });
    jest.advanceTimersByTime(5000);
    expect(ids(manager)).toEqual(["b:open", "sticky:open"]);
  });

  it("keeps a demoted toast paused while it is held", () => {
    const manager = createToastManager({
      timeout: 10_000,
      limit: 3,
      demotedTimeout: 500,
    });
    manager.add({ id: "a" });
    manager.pause("a");
    manager.add({ id: "b" });
    jest.advanceTimersByTime(5000);
    expect(ids(manager)).toEqual(["b:open", "a:open"]);

    manager.resume("a");
    jest.advanceTimersByTime(500);
    expect(ids(manager)).toEqual(["b:open", "a:closing"]);
  });

  it("does not demote on a same-id refresh", () => {
    const manager = createToastManager({
      timeout: 10_000,
      limit: 3,
      demotedTimeout: 500,
    });
    manager.add({ id: "a" });
    manager.add({ id: "b" });
    // `a` is capped at 500 by b's arrival; refreshing b must not re-cap it.
    jest.advanceTimersByTime(400);
    manager.add({ id: "b", title: "again" });
    jest.advanceTimersByTime(100);
    expect(ids(manager)).toEqual(["b:open", "a:closing"]);
  });

  it("holds nothing back by default — the stack just grows", () => {
    const manager = createToastManager({ timeout: 10_000 });
    for (const id of ["a", "b", "c", "d", "e"]) manager.add({ id });
    expect(ids(manager)).toEqual([
      "e:open",
      "d:open",
      "c:open",
      "b:open",
      "a:open",
    ]);
  });

  it("stacks three and drains from the back", () => {
    const manager = createToastManager({
      timeout: 10_000,
      limit: 3,
      demotedTimeout: 1000,
    });
    manager.add({ id: "a" });
    manager.add({ id: "b" });
    manager.add({ id: "c" });
    expect(ids(manager)).toEqual(["c:open", "b:open", "a:open"]);

    // Both older toasts were capped, so the stack empties behind the newest
    // instead of holding three bubbles for ten seconds.
    jest.advanceTimersByTime(1000);
    expect(ids(manager)).toEqual(["c:open", "b:closing", "a:closing"]);
  });
});

describe("pausing", () => {
  it("pause keeps the time left, resume runs it down", () => {
    const manager = createToastManager({ timeout: 1000, limit: 1 });
    manager.add({ id: "a" });
    jest.advanceTimersByTime(700);
    manager.pause("a");

    jest.advanceTimersByTime(5000);
    expect(ids(manager)).toEqual(["a:open"]);

    manager.resume("a");
    jest.advanceTimersByTime(299);
    expect(ids(manager)).toEqual(["a:open"]);
    jest.advanceTimersByTime(1);
    expect(ids(manager)).toEqual(["a:closing"]);
  });

  it("pauseAll holds every countdown; resumeAll does not override a held toast", () => {
    const manager = createToastManager({ timeout: 1000, limit: 2 });
    manager.add({ id: "a" });
    manager.add({ id: "b" });
    manager.pause("a");
    manager.pauseAll();
    jest.advanceTimersByTime(5000);
    expect(ids(manager)).toEqual(["b:open", "a:open"]);

    manager.resumeAll();
    jest.advanceTimersByTime(1000);
    expect(ids(manager)).toEqual(["b:closing", "a:open"]);

    manager.resume("a");
    jest.advanceTimersByTime(1000);
    // `b` has since been removed by the finalize fallback.
    expect(ids(manager)).toEqual(["a:closing"]);
  });

  it("a toast added while suspended waits for resumeAll", () => {
    const manager = createToastManager({ timeout: 1000, limit: 1 });
    manager.pauseAll();
    manager.add({ id: "a" });
    jest.advanceTimersByTime(5000);
    expect(ids(manager)).toEqual(["a:open"]);
    manager.resumeAll();
    jest.advanceTimersByTime(1000);
    expect(ids(manager)).toEqual(["a:closing"]);
  });

  it("re-adding a held id restarts the timer but keeps it held", () => {
    const manager = createToastManager({ timeout: 1000, limit: 1 });
    manager.add({ id: "a" });
    manager.pause("a");
    manager.add({ id: "a", title: "again" });
    jest.advanceTimersByTime(5000);
    expect(ids(manager)).toEqual(["a:open"]);
    manager.resume("a");
    jest.advanceTimersByTime(1000);
    expect(ids(manager)).toEqual(["a:closing"]);
  });

  it("finalize forgets a hold, so the id can be reused", () => {
    const manager = createToastManager({ timeout: 1000, limit: 1 });
    manager.add({ id: "a" });
    manager.pause("a");
    manager.close("a");
    manager.finalize("a");

    manager.add({ id: "a" });
    jest.advanceTimersByTime(1000);
    expect(ids(manager)).toEqual(["a:closing"]);
  });
});

describe("stackDepthOf", () => {
  const open = (id: string): ToastObject => ({ id, state: "open" });
  const closing = (id: string): ToastObject => ({ id, state: "closing" });

  it("counts the toasts in front, newest-first", () => {
    const toasts = [open("c"), open("b"), open("a")];
    expect(stackDepthOf(toasts, "c")).toBe(0);
    expect(stackDepthOf(toasts, "b")).toBe(1);
    expect(stackDepthOf(toasts, "a")).toBe(2);
  });

  it("skips the ones already leaving, so the rest move forward at once", () => {
    // `c` is on its way out: `b` should be drawn in the front slot straight
    // away, not once `c` has been removed.
    const toasts = [closing("c"), open("b"), open("a")];
    expect(stackDepthOf(toasts, "b")).toBe(0);
    expect(stackDepthOf(toasts, "a")).toBe(1);
  });

  it("keeps a leaving toast where it was", () => {
    const toasts = [open("d"), closing("c"), open("b")];
    expect(stackDepthOf(toasts, "c")).toBe(1);
  });

  it("is 0 for the front toast and for one it has never heard of", () => {
    expect(stackDepthOf([open("a")], "a")).toBe(0);
    expect(stackDepthOf([open("a")], "nope")).toBe(0);
  });
});

describe("stackSlotOf", () => {
  it("gives the first three toasts a slot of their own", () => {
    expect(stackSlotOf(0, 3)).toEqual({ slot: 0, buried: false });
    expect(stackSlotOf(1, 3)).toEqual({ slot: 1, buried: false });
    expect(stackSlotOf(2, 3)).toEqual({ slot: 2, buried: false });
  });

  it("parks anything deeper in the last slot and buries it there", () => {
    // The point of the cap: a fourth toast fades out where the third sits
    // instead of climbing another notch up the screen.
    expect(stackSlotOf(3, 3)).toEqual({ slot: 2, buried: true });
    expect(stackSlotOf(9, 3)).toEqual({ slot: 2, buried: true });
  });

  it("handles a stack of one", () => {
    expect(stackSlotOf(0, 1)).toEqual({ slot: 0, buried: false });
    expect(stackSlotOf(1, 1)).toEqual({ slot: 0, buried: true });
  });
});

describe("stackOffsetOf", () => {
  const open = (id: string): ToastObject => ({ id, state: "open" });
  const closing = (id: string): ToastObject => ({ id, state: "closing" });
  const heights = { c: 60, b: 90, a: 60 };

  it("clears everything in front, plus a gap each", () => {
    const toasts = [open("c"), open("b"), open("a")];
    expect(stackOffsetOf(toasts, "c", heights, 10)).toBe(0);
    expect(stackOffsetOf(toasts, "b", heights, 10)).toBe(70);
    expect(stackOffsetOf(toasts, "a", heights, 10)).toBe(170);
  });

  it("gives a leaving toast's room back to the ones behind it", () => {
    const toasts = [closing("c"), open("b"), open("a")];
    expect(stackOffsetOf(toasts, "b", heights, 10)).toBe(0);
    expect(stackOffsetOf(toasts, "a", heights, 10)).toBe(100);
  });

  it("treats an unmeasured toast as taking no room", () => {
    const toasts = [open("c"), open("b")];
    expect(stackOffsetOf(toasts, "b", {}, 10)).toBe(10);
  });
});
