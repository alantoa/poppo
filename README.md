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

## Install

```sh
npx expo install poppo
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
  <Toast.Viewport>         where toasts stack; position and insets
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

| Prop           | Type                   | Default   | Notes                                                                                  |
| -------------- | ---------------------- | --------- | -------------------------------------------------------------------------------------- |
| `timeout`      | `number`               | `5000`    | Auto-dismiss, ms. `0` keeps toasts until closed.                                       |
| `limit`        | `number`               | `1`       | How many toasts are visible at once.                                                   |
| `overflow`     | `"queue" \| "replace"` | `"queue"` | What happens to the next toast once `limit` is reached. See [Scheduling](#scheduling). |
| `toastManager` | `ToastManager`         |           | An external manager; the props above are ignored when it is given.                     |

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

| Part                                | Notes                                                                                                                                                                                        |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Toast.Viewport`                    | Where the toasts stack. `position`, `insets`, `style`. See [Placing the viewport](#placing-the-viewport).                                                                                    |
| `Toast.Root`                        | One toast; takes the `toast` object. `presetAnimation` (`"slide" \| "fade" \| "zoom" \| "none"`, default `"slide"`), `animationDuration` (default `220`), `swipeToDismiss` (default `true`). |
| `Toast.Title` / `Toast.Description` | `Text`s that fall back to the toast's own `title` / `description` when given no children. `Description` renders nothing when there is none.                                                  |
| `Toast.Action` / `Toast.Close`      | `Pressable`s that close the toast, then call your `onPress`.                                                                                                                                 |

### Scheduling

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
