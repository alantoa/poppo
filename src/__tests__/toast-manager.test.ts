import { createToastManager } from "../toast";

// The manager is plain JS driven by setTimeout, so the whole schedule can be
// exercised with fake timers. `Date.now` is faked too — the pause bookkeeping
// reads it to work out how much of a countdown is left.
//
// `toast.tsx` also holds the components, which pull in react-native and (for
// the iOS window overlay) expo-modules-core. None of that runs at module scope
// beyond one `Platform.OS` read, so hollow mocks keep the suite off the full
// jest-expo preset and the dependency chain it drags in. expo-modules-core
// ships untranspiled TypeScript, so it has to be mocked rather than merely
// unused: jest will not transform anything under node_modules.
jest.mock("expo-modules-core", () => ({
  requireNativeViewManager: () => () => null,
}));

jest.mock("react-native", () => ({
  Animated: {},
  AppState: {},
  PanResponder: {},
  Platform: { OS: "ios" },
  Pressable: () => null,
  Text: () => null,
  View: () => null,
}));

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
    const manager = createToastManager({ timeout: 1000 });
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
    const manager = createToastManager({ timeout: 1000 });
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
    const manager = createToastManager({ timeout: 1000 });
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
    const manager = createToastManager({ timeout: 1000 });
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
    const manager = createToastManager({ timeout: 1000 });
    manager.add({ id: "a" });
    manager.add({ id: "b" });
    manager.close("b");
    jest.advanceTimersByTime(1000);
    manager.finalize("a");
    expect(ids(manager)).toEqual([]);
  });

  it("removes a closing toast nobody finalizes, and promotes", () => {
    const manager = createToastManager({ timeout: 1000 });
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
    const manager = createToastManager({ timeout: 1000, overflow: "replace" });
    manager.add({ id: "a" });
    manager.add({ id: "b" });
    expect(ids(manager)).toEqual(["b:open", "a:closing"]);

    manager.finalize("a");
    expect(ids(manager)).toEqual(["b:open"]);
  });

  it("never queues — a burst leaves only the newest", () => {
    const manager = createToastManager({ timeout: 1000, overflow: "replace" });
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

describe("pausing", () => {
  it("pause keeps the time left, resume runs it down", () => {
    const manager = createToastManager({ timeout: 1000 });
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
    const manager = createToastManager({ timeout: 1000 });
    manager.pauseAll();
    manager.add({ id: "a" });
    jest.advanceTimersByTime(5000);
    expect(ids(manager)).toEqual(["a:open"]);
    manager.resumeAll();
    jest.advanceTimersByTime(1000);
    expect(ids(manager)).toEqual(["a:closing"]);
  });

  it("re-adding a held id restarts the timer but keeps it held", () => {
    const manager = createToastManager({ timeout: 1000 });
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
    const manager = createToastManager({ timeout: 1000 });
    manager.add({ id: "a" });
    manager.pause("a");
    manager.close("a");
    manager.finalize("a");

    manager.add({ id: "a" });
    jest.advanceTimersByTime(1000);
    expect(ids(manager)).toEqual(["a:closing"]);
  });
});
