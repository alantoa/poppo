<div align="center">

<img src="./assets/cover.png" /> 
  
[![npm](https://img.shields.io/npm/l/universal-tooltip?style=flat-square)](https://www.npmjs.com/package/universal-tooltip) [![expo](https://img.shields.io/badge/Runs%20with%20Expo-4630EB.svg?style=flat-square&logo=EXPO&labelColor=f3f3f3&logoColor=000)](https://expo.io/)

</div>

###### Works on all platforms, Example project [here](https://github.com/alantoa/universal-tooltip/tree/main/example).

| iOS | Android | Web |
| - | - | - |
| <video src="https://user-images.githubusercontent.com/37520667/264635061-2e9deb58-5141-46f7-99b4-34547972ab6f.mp4" /> | <video src="https://user-images.githubusercontent.com/37520667/264636954-c2471a5c-3f28-4a53-8dac-eb9d97a51ebd.mp4" /> | <video src="https://user-images.githubusercontent.com/37520667/264636470-f2198e04-a6a2-48b7-bd64-45763f48f947.mp4" /> |
 


## What

Anchored-popup **primitives** for React Native and web — one repo, three components with Base UI-shaped APIs:

- **`Tooltip`** — hover (web) / press (native) opened, for hints.
- **`Popover`** — click/press opened, for interactive content (buttons inside work on every platform).
- **`Toast`** — imperative notifications with a manager, provider and unstyled parts.

```tsx
import { Tooltip, Popover, Toast, useToastManager } from "universal-tooltip";

// Tooltip / Popover share the same part structure (Base UI style):
<Tooltip.Root>
  <Tooltip.Trigger>...</Tooltip.Trigger>
  <Tooltip.Portal>
    <Tooltip.Positioner side="top" sideOffset={4}>
      <Tooltip.Popup style={{ backgroundColor: "#363A3E", borderRadius: 12, padding: 12, color: "#fff" }}>
        Plain text popups are rendered natively
        <Tooltip.Arrow width={19} height={12} />
      </Tooltip.Popup>
    </Tooltip.Positioner>
  </Tooltip.Portal>
</Tooltip.Root>

// Toast (Base UI-shaped manager API):
const toast = useToastManager();
toast.add({ title: "Saved", description: "Your booking was updated" });
```

🍎 On iOS:

- This component is written in Swift. The popup is a plain UIKit overlay on the key window: the bubble is positioned, flipped and clamped against the safe area natively, and custom React content is hosted inside it with React Native's own touch pipeline attached, so it stays interactive.

🤖️ On Android:

- This component is written in Kotlin. [`Balloon`](https://github.com/skydoves/Balloon) provides the popup window and its placement; the bubble, its corners and the arrow are drawn by the module so that an `<Arrow>`'s width *and* height are honoured and text popups and React ones render identically.

🌐 On Web:

- `Tooltip` wraps [Base UI](https://base-ui.com)'s [`Tooltip`](https://base-ui.com/react/components/tooltip), and `Popover` wraps its [`Popover`](https://base-ui.com/react/components/popover).

> Hover-based tooltips only work on devices with a pointer. On touch devices reach for `Popover` instead — the two share the same part structure, so it is a one-word change.

## Usage

`Tooltip` and `Popover` expose the same parts, so the only difference is which
one you import.

```tsx
import { Tooltip } from "universal-tooltip";
import { Text, View } from "react-native";

<Tooltip.Root>
  <Tooltip.Trigger>
    <Text>Hello!👋</Text>
  </Tooltip.Trigger>
  <Tooltip.Portal>
    <Tooltip.Positioner side="right" sideOffset={8}>
      <Tooltip.Popup
        presetAnimation="fadeIn"
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
        Some copy...
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

The parts are read from the elements you write inside `Root`, so they cannot be
wrapped in a component of your own — React has not rendered `<MyPositioner />`
yet, so there is nothing to read. Fragments and conditionals are fine, and in
development you get a warning if no `Popup` can be found.

## API

The part structure follows [Base UI's Tooltip](https://base-ui.com/react/components/tooltip):
`Root` › `Trigger` › `Portal` › `Positioner` › `Popup` › `Arrow`. `side` and
`sideOffset` go on `Positioner`; everything about the bubble goes on `Popup`.

### Styling

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

There are two rendering paths, chosen by what you put inside `Popup`:

- **String children** are drawn by the native bubble. A React-rendered bubble
  would be laid out inside the trigger's containing block, so a narrow trigger
  would squeeze the text; the native bubble measures itself against the screen
  instead. It reads `backgroundColor`, `borderRadius`, `padding*` and
  `width`/`maxWidth` from `style`, plus `fontSize`, `color`, `fontWeight` and
  `fontFamily`.
- **Any other children** are rendered by React Native itself, inside the popup
  window, so every style and component works. Give the outermost view its own
  background and radius — that view *is* the bubble.

The arrow's colour defaults to the popup's `style.backgroundColor`; pass
`backgroundColor` on `Arrow` to override it. On web every `ViewStyle` /
`TextStyle` property works as-is.

### Interactive content

Custom views inside the popup are fully interactive on every platform —
`onPress`, gestures and text inputs all work. On native this uses the same
mechanism React Native's `Modal` does (`RCTSurfaceTouchHandler` on iOS, a
`RootView` + `JSTouchDispatcher` host on Android), because the popup is
rendered in a native window outside the React root view.

A press that lands on the popup's own content is the content's — it never
dismisses the popup. Pressing outside does, unless you pass
`disableDismissWhenTouchOutside` to `Root`. For a text popup, pressing the
bubble also dismisses it unless you pass `disableTapToDismiss` to `Popup`.

### Behaviour on native

- The popup follows its trigger while the page scrolls, and closes once the
  trigger has scrolled out of sight.
- It flips to the opposite side when the chosen one does not fit, and is kept
  8pt clear of the display edge. The arrow stays pointed at the trigger either
  way.
- `showDuration` / `dismissDuration` are iOS only.

> If your app enables Metro's `inlineRequires` transform, Base UI's module-level side effects can be deferred in a way that triggers a recoverable React error on first render. Prefer leaving `inlineRequires` off for web builds (the Expo default config already handles this).

## Installation

```sh
yarn add universal-tooltip
```

### Expo

```sh
npx expo install universal-tooltip
```

If you render tooltips on web, also install the web peer dependency:

```sh
yarn add @base-ui/react
```

Expo SDK 53+ default build settings already satisfy the native requirements ([Balloon](https://github.com/skydoves/Balloon) on Android, UIKit on iOS 16.4+). No extra `expo-build-properties` configuration is needed.

## License

MIT
