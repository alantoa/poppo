<div align="center">

# poppo

Tooltip, popover and toast for React Native and the web.

[![npm](https://img.shields.io/npm/v/poppo?style=flat-square)](https://www.npmjs.com/package/poppo) [![license](https://img.shields.io/npm/l/poppo?style=flat-square)](https://www.npmjs.com/package/poppo) [![expo](https://img.shields.io/badge/Runs%20with%20Expo-4630EB.svg?style=flat-square&logo=EXPO&labelColor=f3f3f3&logoColor=000)](https://expo.io/)

</div>

Three unstyled components that share one API shape. You bring the styling; they
handle anchoring, presentation and the platform differences underneath.

| | Opens on | For |
| --- | --- | --- |
| **`Tooltip`** | hover (web) · press (native) | short hints — content is a label, not a surface |
| **`Popover`** | click / press | interactive content — buttons inside work everywhere |
| **`Toast`** | imperatively, via a manager | notifications, queued or replaced, de-duplicated |

On web the anchored components wrap [Base UI](https://base-ui.com)'s `Tooltip`
and `Popover`. On native they are a real native popup window — a UIKit overlay
on iOS, a [Balloon](https://github.com/skydoves/Balloon)-hosted window on
Android — so the bubble is never clipped by a parent and never fights the
z-order of the screen behind it.

## Install

```sh
yarn add poppo
```

Coming from `universal-tooltip`? It is the same package, renamed for 2.0 —
change the import path and nothing else.

Web additionally needs the Base UI peer dependency:

```sh
yarn add @base-ui/react
```

Expo SDK 53+ default build settings already satisfy the native requirements
(iOS 16.4+). No extra `expo-build-properties` configuration is needed.

## Quick start

`Tooltip` and `Popover` expose the same parts, so switching between them is a
one-word change.

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

Uncontrolled by default. Pass `open` to drive it yourself, and pair it with
`onOpenChange` so the popup can still close itself:

```tsx
const [open, setOpen] = useState(false);

<Popover.Root open={open} onOpenChange={setOpen}>
  {/* ... */}
</Popover.Root>;
```

Toasts are imperative. Wrap the app once, render a viewport, then call `add`:

```tsx
import { Toast, useToastManager } from "poppo";

<Toast.Provider timeout={5000} limit={1}>
  <App />
  <Toast.Viewport position="bottom">
    {/* render each toast however you like */}
  </Toast.Viewport>
</Toast.Provider>;

const toast = useToastManager();
toast.add({ title: "Saved", description: "Your booking was updated" });
```

## Anatomy

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

## API

Props marked **web** are accepted everywhere but only take effect on web, and
vice versa.

### `Root`

| Prop | Type | Notes |
| --- | --- | --- |
| `open` | `boolean` | Controlled open state. |
| `defaultOpen` | `boolean` | Uncontrolled initial state. |
| `onOpenChange` | `(open: boolean) => void` | |
| `onDismiss` | `() => void` | Fires when the popup closes. |
| `disableDismissWhenTouchOutside` | `boolean` | **native** — keep it open on an outside press. |
| `modal` | `boolean` | **web** — trap focus. |

### `Trigger`

Accepts every `Pressable` prop. On native it renders a `Pressable` and toggles
the popup on press.

| Prop | Type | Notes |
| --- | --- | --- |
| `disabled` | `boolean` | |
| `delay` | `number` | **web** — hover-open delay, ms. |
| `closeDelay` | `number` | **web** — hover-close delay, ms. |

### `Portal`

| Prop | Type | Notes |
| --- | --- | --- |
| `container` | `HTMLElement \| null` | **web** — where to portal into. |

### `Positioner`

| Prop | Type | Notes |
| --- | --- | --- |
| `side` | `"top" \| "right" \| "bottom" \| "left"` | Defaults to `"top"`. |
| `sideOffset` | `number` | Distance from the trigger. |
| `align` | `"start" \| "center" \| "end"` | **web** |

### `Popup`

Accepts every `View` prop.

| Prop | Type | Notes |
| --- | --- | --- |
| `style` | `ViewStyle & TextStyle` | See [Styling](#styling). |
| `presetAnimation` | `"none" \| "fadeIn" \| "zoomIn"` | |
| `showDuration` | `number` | **iOS** — ms. |
| `dismissDuration` | `number` | **iOS** — ms. |
| `disableTapToDismiss` | `boolean` | **native** — keep a tooltip open when its bubble is pressed. |
| `onTap` | `() => void` | **native** — fires when a tooltip's bubble is pressed. |
| `className` | `string` | **web** |
| `disableDrag` | `boolean` | Deprecated, does nothing. |

### `Arrow`

| Prop | Type | Notes |
| --- | --- | --- |
| `width` | `number` | |
| `height` | `number` | |
| `backgroundColor` | `string` | Defaults to the popup's `style.backgroundColor`. A natively drawn text bubble is one shape, so there it is the popup's colour that wins. |
| `className` | `string` | **web** |

### Toast

`Toast.Provider` creates a manager (or accepts one via `toastManager`) and takes
`timeout` (ms, `0` disables auto-dismiss), `limit` (how many are visible at
once, default `1`) and `overflow` — what happens to the next toast once the
limit is reached:

| `overflow` | Behaviour |
| --- | --- |
| `"queue"` (default) | Holds it until a visible toast goes away, then shows it for its full `timeout`. Strict FIFO — five taps means the fifth shows ~20 s later. |
| `"replace"` | Closes the oldest visible toast so the new one shows at once. The Android Snackbar convention, and usually what a phone wants. |

A toast's countdown pauses while it is being touched, swiped or (on web)
hovered, and while the app is in the background, so it cannot vanish under a
finger or expire unseen.

`useToastManager()` returns the manager plus the visible `toasts`:

| Method | Notes |
| --- | --- |
| `add(options)` | Shows a toast (queueing or replacing per `overflow`), and returns its id. Calling it again with the same `id` **updates** that toast and restarts its timer instead of stacking a duplicate. |
| `close(id)` | Starts the exit animation. |
| `update(id, options)` | Changes a toast's content without touching its timer. |
| `finalize(id)` | Removes immediately. `Toast.Root` calls this after its exit animation. |
| `pause(id)` / `resume(id)` | Hold a countdown, keeping the time left. `Toast.Root` does this during interaction. |
| `pauseAll()` / `resumeAll()` | Hold every countdown. `Toast.Provider` does this when the app leaves the foreground. |

Render them yourself:

| Part | Notes |
| --- | --- |
| `Toast.Viewport` | Where the toasts stack. See [Placing the viewport](#placing-the-viewport). |
| `Toast.Root` | One toast. `presetAnimation` (`"slide" \| "fade" \| "zoom" \| "none"`), `animationDuration`, `swipeToDismiss`. |
| `Toast.Title` / `Toast.Description` | Fall back to the toast's own `title` / `description`. |
| `Toast.Action` / `Toast.Close` | `Pressable`s that close the toast. |

### Placing the viewport

`position` takes `"top"` or `"bottom"`, optionally suffixed `-start` or
`-end` for the horizontal edge — six values in all, defaulting to `"bottom"`.

Two things are yours to decide, because a component this low-level should not
decide them for you:

**Where it is anchored.** The viewport is absolutely positioned, which in React
Native means *relative to its parent*, not to the screen. Mounted at the root of
your app it spans the window; mounted inside a screen that sits above a tab bar
it spans that screen. Put it where you want the toasts to be bounded.

**What it has to stay clear of.** Nothing here knows about safe areas, a home
indicator or a tab bar, and taking a dependency on that would not be this
library's call. Pass what you already have:

```tsx
import { useSafeAreaInsets } from "react-native-safe-area-context";

<Toast.Viewport position="bottom" insets={useSafeAreaInsets()} />
```

`insets` is added to the viewport's own padding, per edge. It has the same
shape as `useSafeAreaInsets()`, so it takes that value directly — and anything
else you need to clear:

```tsx
<Toast.Viewport insets={{ bottom: tabBarHeight + safeAreaBottom }} />
```

Without it, a bottom toast sits under the home indicator on a modern iPhone.
`style` still overrides everything if you want to lay it out yourself.

## Styling

Style the popup exactly like a React Native `<View>` — and, when its children
are plain text, like a `<Text>` as well:

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

- **String children** are drawn by the native bubble. A React-rendered bubble
  would be laid out inside the trigger's containing block, so a narrow trigger
  would squeeze the text; the native bubble measures itself against the screen
  instead. It reads `backgroundColor`, `borderRadius`, `padding*`,
  `width`/`maxWidth`, `fontSize`, `color`, `fontWeight` and `fontFamily` —
  other style properties are ignored on this path.
- **Any other children** are rendered by React Native itself inside the popup
  window, so every style and component works. Give the outermost view its own
  background and radius: that view *is* the bubble.

On web every `ViewStyle` / `TextStyle` property works as-is.

## Tooltip vs. Popover

They share a part structure, but they are not the same component — a hint and a
surface behave differently:

| | `Tooltip` | `Popover` |
| --- | --- | --- |
| Content takes touches | no | yes |
| Pressing the content | dismisses, unless `disableTapToDismiss` | is the content's to handle |
| Assistive tech | announced as a hint | treated as a modal surface |

So put a button inside a `Popover`, never a `Tooltip`.

## Behaviour on native

- Popover content stays interactive — `onPress`, gestures and text inputs all
  work inside the bubble, using the same mechanism React Native's `Modal` uses
  (`RCTSurfaceTouchHandler` on iOS, a `RootView` + `JSTouchDispatcher` host on
  Android).
- The popup follows its trigger while the page scrolls, and closes once the
  trigger has scrolled out of sight.
- It flips to the opposite side when the chosen one does not fit, and is kept
  8pt clear of the display edge. The arrow stays pointed at the trigger either
  way.

## Accessibility

- `Trigger` is a button and reports its `expanded` state.
- A popover is a modal surface on iOS, so VoiceOver stays inside it while it is
  open.
- Text popups are announced when they open. Custom tooltip content is announced
  through a live region on Android.

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
cd example
yarn ios       # or yarn android
yarn test:ios  # XCUITest suite
```

[AGENTS.md](./AGENTS.md) documents the platform behaviour the native
implementation is shaped around, and the invariants that break silently.

> If your app enables Metro's `inlineRequires` transform, Base UI's
> module-level side effects can be deferred in a way that triggers a
> recoverable React error on first render. Prefer leaving `inlineRequires` off
> for web builds (the Expo default config already handles this).

## License

MIT
