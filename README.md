<div align="center">

# poppo

Tooltip, popover and toast for Expo and React Native.
Real native popups on iOS and Android, [Base UI](https://base-ui.com) on web — one API on all three.

[![npm](https://img.shields.io/npm/v/poppo?style=flat-square)](https://www.npmjs.com/package/poppo) [![license](https://img.shields.io/npm/l/poppo?style=flat-square)](https://www.npmjs.com/package/poppo) [![expo](https://img.shields.io/badge/Runs%20with%20Expo-4630EB.svg?style=flat-square&logo=EXPO&labelColor=f3f3f3&logoColor=000)](https://expo.io/)

</div>

```tsx
import { Tooltip, Popover, Toast, useToastManager } from "poppo";
```

|               | Opens on                     | For                                                         |
| ------------- | ---------------------------- | ----------------------------------------------------------- |
| **`Tooltip`** | hover (web) · press (native) | short hints — the content is a label, not a surface         |
| **`Popover`** | click / press                | interactive content — buttons inside work on every platform |
| **`Toast`**   | imperatively, via a manager  | notifications — queued or replaced, de-duplicated, pausable |

All three are unstyled. You bring the look; poppo handles anchoring,
presentation, scheduling and the platform differences underneath.

## Why poppo

- **Native popup windows, not absolutely-positioned views.** On iOS the bubble
  is a UIKit overlay on the window; on Android it is a
  [Balloon](https://github.com/skydoves/Balloon)-hosted window. It is never
  clipped by a scroll view or a parent with `overflow: hidden`, and it never
  fights the z-order of whatever is behind it.
- **Popover content is really interactive.** Buttons, gestures and text inputs
  inside the bubble work, through the same touch-dispatch mechanism React
  Native's own `Modal` uses.
- **One component set for three platforms.** Web wraps Base UI's `Tooltip` and
  `Popover`, so you get its positioning, focus handling and accessibility for
  free — and the same JSX runs on native.
- **A toast manager built for phones.** Visible limit with a `queue` or
  `replace` overflow policy, one-toast-per-id de-duplication, and countdowns
  that pause while the toast is under a finger or the app is in the background.
  Toasts stack the way sonner's do — the newest in front, the ones behind
  scaled back and dimmed — and the stack drains from the back, so a burst of
  taps does not mean waiting out every timeout. On iOS the viewport can own a
  window, so a toast raised from inside a `Modal` shows _above_ it instead of
  behind it.
- **Animations and gestures on the UI thread.** Toast enter/exit, the stack
  reflow and swipe-to-dismiss all run through Reanimated and Gesture Handler,
  so a busy JS thread cannot stutter them.

## Install

```sh
npx expo install poppo
```

Toasts need Reanimated and Gesture Handler:

```sh
npx expo install react-native-reanimated react-native-gesture-handler
```

and Gesture Handler has to wrap your app once, at the root:

```tsx
import { GestureHandlerRootView } from "react-native-gesture-handler";

<GestureHandlerRootView style={{ flex: 1 }}>
  <App />
</GestureHandlerRootView>;
```

Web additionally needs the Base UI peer dependency:

```sh
yarn add @base-ui/react
```

Expo SDK 53+ default build settings already satisfy the native requirements
(iOS 16.4+, Swift 5.9). No `expo-build-properties` configuration is needed.
The native module is autolinked; there is nothing to register.

## Quick start

### Tooltip

```tsx
import { Tooltip } from "poppo";
import { Text } from "react-native";

<Tooltip.Root>
  <Tooltip.Trigger>
    <Text>Hover me</Text>
  </Tooltip.Trigger>
  <Tooltip.Portal>
    <Tooltip.Positioner side="top" sideOffset={8}>
      <Tooltip.Popup
        style={{
          backgroundColor: "#363A3E",
          borderRadius: 12,
          paddingHorizontal: 16,
          paddingVertical: 12,
          maxWidth: 260,
          color: "#fff",
          fontSize: 14,
        }}
      >
        Saved to your library
        <Tooltip.Arrow width={14} height={8} />
      </Tooltip.Popup>
    </Tooltip.Positioner>
  </Tooltip.Portal>
</Tooltip.Root>;
```

### Popover

Same parts, one word changed — and now the content can hold a button:

```tsx
import { Popover } from "poppo";
import { Pressable, Text, View } from "react-native";

<Popover.Root>
  <Popover.Trigger>
    <Text>Remove</Text>
  </Popover.Trigger>
  <Popover.Portal>
    <Popover.Positioner side="top" sideOffset={8}>
      <Popover.Popup presetAnimation="fadeIn">
        <View
          style={{ backgroundColor: "#fff", borderRadius: 12, padding: 16 }}
        >
          <Text>Remove download?</Text>
          <Pressable onPress={remove}>
            <Text>Remove</Text>
          </Pressable>
        </View>
        <Popover.Arrow width={14} height={8} backgroundColor="#fff" />
      </Popover.Popup>
    </Popover.Positioner>
  </Popover.Portal>
</Popover.Root>;
```

Both are uncontrolled by default. Pass `open` to drive one yourself, and pair
it with `onOpenChange` so the popup can still close itself:

```tsx
const [open, setOpen] = useState(false);

<Popover.Root open={open} onOpenChange={setOpen}>
  {/* ... */}
</Popover.Root>;
```

### Toast

Wrap the app once, render the visible toasts inside a viewport, then call
`add` from anywhere below the provider:

```tsx
import { Toast, useToastManager } from "poppo";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function Toasts() {
  const { toasts } = useToastManager();
  return (
    <Toast.Viewport position="bottom" insets={useSafeAreaInsets()}>
      {toasts.map((toast) => (
        <Toast.Root
          key={toast.id}
          toast={toast}
          style={{ backgroundColor: "#111", borderRadius: 12, padding: 14 }}
        >
          <Toast.Title style={{ color: "#fff", fontWeight: "500" }} />
          <Toast.Description style={{ color: "#bbb" }} />
          <Toast.Close>
            <Text style={{ color: "#fff" }}>Dismiss</Text>
          </Toast.Close>
        </Toast.Root>
      ))}
    </Toast.Viewport>
  );
}

export default function App() {
  return (
    <Toast.Provider timeout={5000} limit={1} overflow="replace">
      <Screens />
      <Toasts />
    </Toast.Provider>
  );
}

// anywhere below the provider
const toast = useToastManager();
toast.add({ title: "Saved", description: "Your booking was updated" });
```

`Toast.Root` handles the enter/exit animation, swipe-to-dismiss and pausing
the countdown while it is touched. Everything inside it is yours.

## Anatomy

`Tooltip` and `Popover` expose the same six parts:

```text
<Root>                     open state
  <Trigger />              what you press or hover
  <Portal>                 renders outside the parent
    <Positioner>           side and offset
      <Popup>              the bubble
        <Arrow />
```

The parts are read from the elements you write inside `Root`, so they cannot be
wrapped in a component of your own — React has not rendered `<MyPositioner />`
yet, so there is nothing to read. Fragments and conditionals are fine, and in
development `Root` warns if it cannot find a `Popup`.

`Toast` is a provider plus parts you compose per toast:

```text
<Toast.Provider>           the manager: timeout, limit, overflow
  <Toast.Viewport>         where toasts stack; position, insets, presentation
    <Toast.Root>           one toast: animation, swipe, pause-on-touch
      <Toast.Title />
      <Toast.Description />
      <Toast.Action /> · <Toast.Close />
```

## API — Tooltip and Popover

Props marked **web** are accepted everywhere but only take effect on web, and
vice versa.

### `Root`

| Prop                             | Type                      | Notes                                          |
| -------------------------------- | ------------------------- | ---------------------------------------------- |
| `open`                           | `boolean`                 | Controlled open state.                         |
| `defaultOpen`                    | `boolean`                 | Uncontrolled initial state.                    |
| `onOpenChange`                   | `(open: boolean) => void` |                                                |
| `onDismiss`                      | `() => void`              | Fires when the popup closes.                   |
| `disableDismissWhenTouchOutside` | `boolean`                 | **native** — keep it open on an outside press. |
| `modal`                          | `boolean`                 | **web**, popover only — trap focus.            |

### `Trigger`

Accepts every `Pressable` prop. On native it renders a `Pressable` and toggles
the popup on press.

| Prop         | Type      | Notes                                          |
| ------------ | --------- | ---------------------------------------------- |
| `disabled`   | `boolean` |                                                |
| `delay`      | `number`  | **web**, tooltip only — hover-open delay, ms.  |
| `closeDelay` | `number`  | **web**, tooltip only — hover-close delay, ms. |

### `Portal`

| Prop        | Type                  | Notes                           |
| ----------- | --------------------- | ------------------------------- |
| `container` | `HTMLElement \| null` | **web** — where to portal into. |

### `Positioner`

| Prop         | Type                                     | Notes                      |
| ------------ | ---------------------------------------- | -------------------------- |
| `side`       | `"top" \| "right" \| "bottom" \| "left"` | Defaults to `"top"`.       |
| `sideOffset` | `number`                                 | Distance from the trigger. |
| `align`      | `"start" \| "center" \| "end"`           | **web**                    |

### `Popup`

Accepts every `View` prop.

| Prop                  | Type                             | Notes                                                        |
| --------------------- | -------------------------------- | ------------------------------------------------------------ |
| `style`               | `ViewStyle & TextStyle`          | See [Styling](#styling).                                     |
| `presetAnimation`     | `"none" \| "fadeIn" \| "zoomIn"` |                                                              |
| `showDuration`        | `number`                         | **iOS** — ms.                                                |
| `dismissDuration`     | `number`                         | **iOS** — ms.                                                |
| `disableTapToDismiss` | `boolean`                        | **native** — keep a tooltip open when its bubble is pressed. |
| `onTap`               | `() => void`                     | **native** — fires when a tooltip's bubble is pressed.       |
| `className`           | `string`                         | **web**                                                      |

### `Arrow`

| Prop              | Type     | Notes                                                                                                                                    |
| ----------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `width`           | `number` |                                                                                                                                          |
| `height`          | `number` |                                                                                                                                          |
| `backgroundColor` | `string` | Defaults to the popup's `style.backgroundColor`. A natively drawn text bubble is one shape, so there it is the popup's colour that wins. |
| `className`       | `string` | **web**                                                                                                                                  |

## API — Toast

### `Toast.Provider`

Creates the manager, or accepts one you made with `createToastManager()` via
`toastManager` (useful for calling `add` from outside React).

| Prop             | Type                   | Default    | Notes                                                                                                                          |
| ---------------- | ---------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `timeout`        | `number`               | `5000`     | Auto-dismiss, ms. `0` keeps toasts until closed.                                                                               |
| `limit`          | `number`               | `Infinity` | How many toasts the manager keeps live. Nothing is held back by default — how many are _drawn_ is `Toast.Root`'s `maxVisible`. |
| `overflow`       | `"queue" \| "replace"` | `"queue"`  | What happens to the next toast once `limit` is reached. See [Scheduling](#scheduling).                                         |
| `demotedTimeout` | `number`               | `2000`     | Ceiling on what a toast has left once a newer one pushes it back in the stack. Only ever shortens.                             |
| `toastManager`   | `ToastManager`         |            | An external manager; the props above are ignored when it is given.                                                             |

### `useToastManager()`

Returns the visible `toasts` plus the three calls a screen needs:

|                       | Notes                                                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `toasts`              | `ToastObject[]`, newest first. Queued toasts are not included until they are promoted.                                                                 |
| `add(options)`        | Shows a toast and returns its `id`. Calling it again with the same `id` **updates** that toast and restarts its timer instead of stacking a duplicate. |
| `close(id)`           | Starts the exit animation; the manager removes it when `Toast.Root` reports the animation done.                                                        |
| `update(id, options)` | Changes a toast's content without touching its timer.                                                                                                  |

`ToastAddOptions` is `{ id?, title?, description?, type?, timeout?, data? }`.
`type` is `"default" | "success" | "error" | "warning" | "info"` and `data` is
whatever your toast component wants to read — poppo renders none of it.

### The manager

`createToastManager(options)` returns the full object behind the hook, for use
outside React or in tests:

| Method                          | Notes                                                                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `add` / `close` / `update`      | As above.                                                                                                                      |
| `finalize(id)`                  | Removes immediately. `Toast.Root` calls this after its exit animation; a 600 ms fallback removes a toast nothing is rendering. |
| `pause(id)` / `resume(id)`      | Hold one countdown, keeping the time left. `Toast.Root` does this while the toast is touched, swiped or hovered.               |
| `pauseAll()` / `resumeAll()`    | Hold every countdown. `Toast.Provider` does this while the app is not in the foreground.                                       |
| `getToasts()` / `subscribe(fn)` | The external-store surface `useSyncExternalStore` reads.                                                                       |

### Parts

| Part                                | Notes                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Toast.Viewport`                    | Where the toasts stack. `position`, `insets`, `presentation`, `style`. See [Placing the viewport](#placing-the-viewport).                                                                                                                                                                                                                        |
| `Toast.Root`                        | One toast; takes the `toast` object. `presetAnimation` (`"spring" \| "slide" \| "fade" \| "zoom" \| "none"`, default `"spring"`), `animationDuration` — the exit only, since the entrance is a spring (default `160`), `swipeToDismiss` (default `true`), and the stack look: `maxVisible` (`3`), `stackPeek` (`14`), `stackScaleStep` (`0.05`). |
| `Toast.Title` / `Toast.Description` | `Text`s that fall back to the toast's own `title` / `description` when given no children. `Description` renders nothing when there is none.                                                                                                                                                                                                      |
| `Toast.Action` / `Toast.Close`      | `Pressable`s that close the toast, then call your `onPress`.                                                                                                                                                                                                                                                                                     |

### Scheduling

The toasts are drawn as a stack: the newest sits in front at the anchored
edge, and each one behind it peeks `stackPeek` points past it and is
`stackScaleStep` smaller. `maxVisible` (3) of them show; a toast deeper than
that fades out where the last visible one sits rather than climbing further up
the screen, so a long run stays a stack of three rather than a ladder.

They overlap rather than sharing a column, so a toast finishing its exit
animation never shifts the ones that remain — and it gives up its place the
moment it starts leaving, so the toasts behind it spring forward while it is
still fading rather than after it is gone.

### Opening the stack

> **Experimental.** Verified on neither platform yet, and on Android a tap has
> been seen to clear the stack rather than open it. It is off by default; treat
> it as iOS-first and drive `expanded` yourself if you need this today.

`expandable` on the viewport lets a tap spread the stack out into a list, so
the toasts behind the front one can be read and dismissed. What opens out is
the stack **as drawn** — the `maxVisible` toasts — not every toast the manager
is holding. Each one moves clear of the ones in front of it, which takes their
measured heights, plus `expandedGap` between them.

| Prop                                                | Default |                                                              |
| --------------------------------------------------- | ------- | ------------------------------------------------------------ |
| `expandable`                                        | `false` | Turns the tap on. Only live while more than one toast is up. |
| `expandedGap`                                       | `12`    | Room between the toasts once open.                           |
| `expanded` / `defaultExpanded` / `onExpandedChange` |         | Own the open state instead.                                  |

Every countdown is held while the stack is open, so nothing times out while it
is being read, and an open stack that drains down to one toast closes itself.

A tap reaches the toast's own children too, so if yours have buttons in them,
leave `expandable` off and drive `expanded` from wherever you want the trigger
to be.

A toast enters by springing in from off its edge, and leaves on a short fixed
curve — sinking a little as it fades, and carrying on the way it was thrown
when it was swiped out.

Only the front toast takes the gesture; the ones behind it are covered. Drag it
**sideways in either direction**, or **toward its own edge**, past 56 points or
800 points/second to dismiss it. Dragging _away_ from its edge gives a little
and stops, since there is no way out that way. A diagonal flick goes with
whichever axis the finger travelled further along.

An older toast has its countdown capped at `demotedTimeout` as soon as a newer
one arrives. Without that, four taps means sitting through four full timeouts
before the stack clears; with it the back drains while the newest toast is
still fresh. It only ever shortens a countdown, and a toast with `timeout: 0`
is left alone — it asked to stay.

At most `limit` toasts are visible. When another one arrives:

| `overflow`  | Behaviour                                                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `"queue"`   | It waits until a visible toast goes away, then shows for its **full** `timeout` — queued toasts do not age. Strict FIFO.        |
| `"replace"` | The oldest visible toast closes and the new one shows at once. The Android Snackbar convention, and usually what a phone wants. |

A toast under a finger never expires: `Toast.Root` pauses the countdown on
touch and drag (and on hover, on web) and resumes it with the time that was
left. The provider pauses every countdown while the app is inactive or in the
background, so a toast is not spent while nobody can see it.

Re-adding an `id` that is still animating out brings that toast back instead of
stacking a second copy.

### Placing the viewport

`position` takes `"top"` or `"bottom"`, optionally suffixed `-start` or `-end`
for the horizontal edge — six values in all, defaulting to `"bottom"`.

Two things are yours to decide, because a component this low-level should not
decide them for you:

**Where it is anchored.** The viewport is absolutely positioned, which in React
Native means _relative to its parent_, not to the screen. Mounted at the root of
your app it spans the window; mounted inside a screen that sits above a tab bar
it spans that screen. Put it where you want the toasts to be bounded.

**What it has to stay clear of.** Nothing here knows about safe areas, a home
indicator or a tab bar, and taking a dependency on that would not be this
library's call. Pass what you already have:

```tsx
<Toast.Viewport position="bottom" insets={useSafeAreaInsets()} />
<Toast.Viewport insets={{ bottom: tabBarHeight + safeAreaBottom }} />
```

`insets` is added to the viewport's own padding, per edge, and has the same
shape as `useSafeAreaInsets()`. Without it, a bottom toast sits under the home
indicator on a modern iPhone. `style` still overrides everything if you want to
lay it out yourself.

### Showing toasts above a Modal

An inline viewport is a view in your tree, so React Native's `Modal` covers it —
`Modal` presents a view controller of its own. `presentation="window"` moves the
viewport into an overlay on the window itself, which a modal does not cover.

```tsx
<Toast.Viewport position="bottom" presentation="window" insets={insets} />
```

| `presentation`       | Behaviour                                                                                                                                                                         |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `"inline"` (default) | An absolutely positioned view in the React tree, bounded by its parent — like any other view.                                                                                     |
| `"window"`           | **iOS only.** An overlay on the window: not clipped by an ancestor, and raised above an open `Modal`. Falls back to `"inline"` on Android and web, with a warning in development. |

Two things to know before switching:

- **`position` starts measuring from the screen.** The overlay _is_ the window,
  so a viewport that used to be bounded by a screen sitting above a tab bar is
  now bounded by the display. Your `insets` are what keep it clear.
- **A modal presented while a toast is already up still covers that toast.** The
  overlay wins by being added to the window last, so it is raised when a toast
  arrives rather than held on top continuously. The next toast raises it again.

Android keeps the viewport inline: its `Modal` is a `Dialog` with a window of
its own, and getting above that has no permission-free equivalent.

## Styling

Style a popup exactly like a React Native `<View>` — and, when its children are
plain text, like a `<Text>` as well:

```tsx
<Tooltip.Popup
  style={{
    backgroundColor: "rgba(54,58,62,0.85)",
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    maxWidth: 240,
    fontSize: 14,
    lineHeight: 21,
    color: "#fff",
  }}
>
  Drag to reschedule
  <Tooltip.Arrow width={14} height={8} />
</Tooltip.Popup>
```

There are two rendering paths on native, chosen by what is inside `Popup`:

- **String children** are drawn by the native bubble, which measures itself
  against the screen rather than the trigger — so a narrow trigger never
  squeezes the text into a column. This path reads `backgroundColor`,
  `borderRadius`, `padding*`, `width`/`maxWidth`, `fontSize`, `color`,
  `fontWeight` and `fontFamily`; other style properties are ignored.
- **Any other children** are rendered by React Native itself inside the popup
  window, so every style and component works. Give the outermost view its own
  background and radius: that view _is_ the bubble.

On web every `ViewStyle` / `TextStyle` property works as-is. Toasts are
ordinary React Native views on every platform; style them however you like.

## Tooltip vs. Popover

They share a part structure, but a hint and a surface behave differently:

|                       | `Tooltip`                               | `Popover`                  |
| --------------------- | --------------------------------------- | -------------------------- |
| Content takes touches | no                                      | yes                        |
| Pressing the content  | dismisses, unless `disableTapToDismiss` | is the content's to handle |
| Assistive tech        | announced as a hint                     | treated as a modal surface |

Put a button inside a `Popover`, never a `Tooltip`.

## Platform notes

**Native**

- Popover content stays interactive — `onPress`, gestures and text inputs all
  work inside the bubble, using the same mechanism React Native's `Modal` uses
  (`RCTSurfaceTouchHandler` on iOS, a `RootView` + `JSTouchDispatcher` host on
  Android).
- The popup follows its trigger while the page scrolls, and closes once the
  trigger has scrolled out of sight.
- It flips to the opposite side when the chosen one does not fit, and is kept
  8pt clear of the display edge. The arrow stays pointed at the trigger either
  way.

**Web**

- `Tooltip` and `Popover` are Base UI's, with poppo's props mapped onto them.
  The stylesheet they need is imported by the web entry; no manual CSS import.
- If your Metro config enables `inlineRequires`, Base UI's module-level side
  effects can be deferred in a way that triggers a recoverable React error on
  first render. Leave it off for web builds — the Expo default already does.

## Accessibility

- `Trigger` is a button and reports its `expanded` state.
- A popover is a modal surface on iOS, so VoiceOver stays inside it while it is
  open.
- Text popups are announced when they open. Custom tooltip content is announced
  through a live region on Android.
- `Toast.Close` carries an accessibility label of "Close notification".

Still missing, and worth knowing before reaching for these in production:

- **No focus management, and no back-button handling on Android.** A popover
  does not move focus into itself or restore it on close.
- **Custom tooltip content is not announced on iOS.** Its children cannot be
  reduced to a string to read out; give the `Trigger` an `accessibilityHint`
  instead.
- **No `ref` forwarding and no `asChild` on native.** `Trigger` renders its own
  `Pressable` around your children.

## Contributing

`example/` is a playground app that doubles as the test bed:

```sh
yarn test      # the toast manager's schedule, under jest
cd example
yarn ios       # or yarn android
yarn test:ios  # XCUITest suite — real touches against real popups
```

[AGENTS.md](./AGENTS.md) documents the platform behaviour the native
implementation is shaped around, and the invariants that break silently.

## License

MIT
