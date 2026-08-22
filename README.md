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

- This component is written in Kotlin and wraps the excellent library - [`Balloon`](https://github.com/skydoves/Balloon).

🌐 On Web:

- This component wraps [Base UI](https://base-ui.com)'s [`Popover`](https://base-ui.com/react/components/popover) for mobile use (pass `usePopover` to `Root`).

- This component wraps [Base UI](https://base-ui.com)'s [`Tooltip`](https://base-ui.com/react/components/tooltip) for desktop use.

> Please note that hover-based tooltips only work on devices with a pointer — on touch devices, pass `usePopover` to `Root` to switch to the tap-triggered popover behavior.

## Usage

```tsx
import { useState } from "react";
import * as Tooltip from "universal-tooltip";
import { Text, View, Pressable, Platform } from "react-native";

// because each platform has different behaviors, but you can replace the components yourself, of course.
const TriggerView = Platform.OS === "web" ? View : Pressable;

const [open, setOpen] = useState(false);

<Tooltip.Root
  // For web, I would like to be triggered automatically with the mouse.
  {...Platform.select({
    web: {},
    default: {
      open,
      onDismiss: () => {
        console.log("onDismiss");
        setOpen(false);
      },
    },
  })}
>
  <Tooltip.Trigger>
    <TriggerView
      {...Platform.select({
        web: {},
        default: {
          open,
          onPress: () => {
            setOpen(true);
          },
        },
      })}
    >
      <Text>Hello!👋</Text>
    </TriggerView>
  </Tooltip.Trigger>
  <Tooltip.Content
    sideOffset={3}
    containerStyle={{
      paddingLeft: 16,
      paddingRight: 16,
      paddingTop: 8,
      paddingBottom: 8,
    }}
    onTap={() => {
      setOpen(false);
      console.log("onTap");
    }}
    dismissDuration={500}
    disableTapToDismiss
    side="right"
    presetAnimation="fadeIn"
    backgroundColor="black"
    borderRadius={12}
  >
    <Tooltip.Text text="Some copy..." style={{ color: "#000", fontSize: 16 }} />
  </Tooltip.Content>
</Tooltip.Root>;
```

## API

This component's API is close to [Base UI's Tooltip](https://base-ui.com/react/components/tooltip) component, but there are some differences on native.

### Styling

Style the tooltip exactly like React Native's `<View>` and `<Text>`:

```tsx
<Tooltip.Content
  side="top"
  style={{
    backgroundColor: "rgba(54,58,62,0.85)",
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    maxWidth: 240,
  }}
>
  <Tooltip.Text
    text="Drag to reschedule"
    style={{ fontSize: 14, lineHeight: 21, color: "#fff" }}
  />
  <Tooltip.Arrow width={19} height={12} />
</Tooltip.Content>
```

- The arrow color is derived from the content's `style.backgroundColor` automatically.
- On web every `ViewStyle`/`TextStyle` property works as-is.
- On iOS/Android, text tooltips are rendered by the native bubble, which reads
  `backgroundColor`, `borderRadius`, `padding*`, `width`/`maxWidth` from the
  content `style` and `fontSize`, `color`, `fontWeight`, `fontFamily` from the
  text `style`. Custom views (any non-`Tooltip.Text` children) are rendered by
  React Native itself — give them an explicit size and every style works.
- The legacy `backgroundColor` / `borderRadius` / `maxWidth` / `containerStyle`
  props keep working but are deprecated in favor of `style`.

### Interactive content

Custom views inside the tooltip are fully interactive on all platforms — `onPress`, gestures, and text inputs work inside the bubble. On native this is powered by the same mechanism React Native's `Modal` uses (`RCTSurfaceTouchHandler` on iOS, a `RootView` + `JSTouchDispatcher` host on Android), since the tooltip is rendered in a native window outside the React root view.

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
