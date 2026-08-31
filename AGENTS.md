# Working on poppo

An Expo module: anchored popups (tooltip, popover) plus a toast manager, for
iOS, Android and web. Published on npm as `poppo`; it was `universal-tooltip`
through 1.x, and `alias/universal-tooltip` is the shim that keeps the old name
installing. `src/` is the JS surface, `ios/` is Swift, `android/` is
Kotlin, and `example/` is a playground app that doubles as the test bed.

This file records what is **not** discoverable by reading the code — the
platform behaviour the implementation is shaped around, and the invariants that
break silently when violated. Everything else, read from the source.

## Commands

```sh
yarn lint                       # eslint (src only)
yarn test                       # jest: the toast manager's schedule (see below)
npx tsc --noEmit                # library
npx tsc --noEmit -p example/tsconfig.json
yarn build                      # tsc to build/ + copy the css (does NOT clean; see below)

cd example
yarn start                      # Metro
yarn ios                        # or yarn android
yarn test:ios                   # XCUITest suite; starts Metro itself if needed
```

Two build steps have non-obvious prerequisites, both of which fail with errors
that do not name the cause:

- Gradle needs `ANDROID_HOME`, or it reports "SDK location not found":
  `cd example/android && ANDROID_HOME=$HOME/Library/Android/sdk ./gradlew :app:assembleDebug`
- `pod install` needs a UTF-8 locale, or CocoaPods dies inside
  `unicode_normalize` with `Encoding::CompatibilityError`:
  `cd example/ios && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pod install`

`yarn test` is deliberately **not** on the `expo-module-scripts` jest preset:
that preset needs `babel-preset-expo` and `expo` at the package root, which
this library does not otherwise depend on. It is plain `ts-jest` in a node
environment instead, and the test mocks `react-native` hollow — enough for the
toast manager, which is pure JS. Anything that renders a component will need
the real preset (and those dependencies) first. `expo-modules-core` is mocked
too, and has to be: it publishes untranspiled TypeScript and jest transforms
nothing under `node_modules`, so merely not using it stops being enough once
anything in the import graph reaches it.

`yarn build` compiles without cleaning, so files deleted from `src/` linger in
`build/`. That does not reach npm — `prepublishOnly` runs `expo-module clean`
first — but do not trust `build/` after deleting a source file. `yarn clean`
first. `yarn prepare` is **not** a build: in expo-module-scripts 56 it is a
noop that prints a warning, so a `build/` holding only `styles.css` means
nothing has been compiled. And `expo-module build` is bare `tsc`, which is why
`build` and `prepublishOnly` both chain `yarn copy-files` — the web entry
imports `./styles.css`, and without the copy the published package breaks on
web only.

## The JS ↔ native contract

A popup renders one of two ways, chosen by what is inside `<Popup>`:

- **String children** → drawn natively from props (`text`, `textStyle`,
  `containerStyle`). `Popup` returns `null`, so **no popup child is mounted at
  all**.
- **Anything else** → rendered by React Native inside the native popup window.

For the second path, `Popup` mounts two nested views, and native finds them by
`nativeID` (never by child index — Fabric does not guarantee mount order):

- `universal-tooltip-content` — the **slot**: absolutely positioned and as wide
  as the window. It is a measuring box, not the bubble. Yoga measures an
  absolute child inside its containing block, so a slot left to hug a 68pt
  trigger would wrap a `maxWidth: 260` bubble into a narrow column.
- `universal-tooltip-body` — the **bubble**: hugs its content. Its frame is what
  native positions, sizes and points the arrow at.

The slot is always laid out, open or closed. Sizing it from a JS `onLayout`
round trip instead was the original cause of iOS popups opening as a bare arrow
in the wrong place: the measurement could not settle while the slot was
collapsed.

Both platforms take over React's child bookkeeping so the slot can live outside
the anchor view — `reactChildren` on iOS, a `GroupView` definition on Android.
If you add a child to the anchor, it must go through those.

## Platform behaviour that shaped the code

**`ExpoView` on Android extends `LinearLayout`.** Anything that triggers its
measure/layout — a `requestLayout` override, calling `super.onLayout` — runs
LinearLayout's horizontal arrangement over children that React positions
itself, and shifts them. This is why `UniversalTooltipView` no-ops both
`onMeasure` and `onLayout`. Symptom when it regresses: triggers pushed sideways
out of their container by the width of a sibling.

**Expo re-applies the whole prop map on every transaction.** `finalizeUpdates`
in `ExpoFabricViewObjC.mm` iterates all props and calls every setter — there is
no diffing. So `OnViewDidUpdateProps` fires constantly, and anything expensive
behind it needs its own change check (both platforms compare a "chrome
signature" before re-laying out).

**Fabric never recycles Expo views.** `ExpoFabricView.shouldBeRecycled()`
returns `false`, so `prepareForRecycle` is dead code. The reachable teardown
hook is `invalidate`, which React calls on every unmounted view that skips the
pool. Its default lives in a `UIView` category that Swift cannot see, so it is
implemented as `@objc func invalidate()` with **no** `override` and no `super`
call.

**React's iOS views never consume UIKit touches.** They observe them through a
gesture recognizer, so a press on popup content walks up the responder chain
and reaches the overlay too. Anything the overlay does in `touchesEnded` must
first check the touch against the bubble's frame, or pressing the popup's own
content dismisses it.

**Balloon's arrow is a square `ImageView`** driven by one `setArrowSize`, so it
cannot express a 14×8 triangle. Android disables it and draws bubble, corners
and arrow in `TooltipRootViewGroup`, positioning the arrow after the window is
up — that is the only moment Balloon's edge clamping is knowable.

## The toast viewport's window overlay

`<Toast.Viewport presentation="window" />` is iOS-only, and exists for one
reason: React Native's `Modal` presents a view controller, so UIKit adds its
transition view to the same window and an inline viewport ends up underneath.

`ToastOverlayView` handles it the way `RCTModalHostView` handles a modal's own
content, and the way `UniversalTooltipView` already handles a popup: the React
children are moved out into a container added straight to the window, with one
`RCTSurfaceTouchHandler` attached to that container so touches still reach JS.
Two details are load-bearing:

- **The overlay is attached late, and re-attached on every new toast.**
  `addSubview` appends, so the last view added is frontmost. That is the entire
  mechanism by which a toast beats an already-open modal — no higher
  `windowLevel` is involved. The known gap: a modal presented *while* a toast
  is showing covers it until the next toast raises the overlay again. Closing
  that gap properly means a dedicated `UIWindow` above `.alert`.
- **The slot is given the window's size from JS.** The host view is 0×0 — its
  children live elsewhere and it must not disturb the layout around it — and
  Yoga measures an absolute child inside its containing block, so a slot left to
  inherit would collapse. `useWindowDimensions()` feeds it, which also
  re-renders on rotation.

The container hit-tests its subviews directly instead of calling `super`, so a
toast mid-swipe past the container edge stays pressable while misses fall
through to the app. The slot must keep `pointerEvents: "box-none"`, or a
full-window transparent view eats every touch on the screen.

`ToastOverlayView` is registered as a **second** `View` in
`UniversalTooltipModule` and must stay after the first: expo-modules-core makes
`viewDefinitions.first` the module's default view, which is what
`requireNativeViewManager("UniversalTooltip")` resolves to. This one is
addressed by `ViewName("ToastOverlay")`.

Android has no permission-free equivalent — its `Modal` is a `Dialog` with its
own window, so being above it means attaching to whichever window is topmost and
following it as modals open and close. The viewport stays inline there, and
`presentation="window"` warns once in `__DEV__`.

## Verifying a change

Screenshots are not enough for anything touch-related; drive it.

- **iOS**: `cd example && yarn test:ios`. There is no tap injection available
  otherwise — `simctl` has no input command, and controlling the simulator
  window from outside needs Accessibility permission that a CLI agent will not
  have. The suite covers the paths only a real touch reaches, and it has caught
  a real bug that every screenshot pass missed.
  Leaving the previously installed runner on the simulator makes the run
  execute the **previous** build of the tests — a silent way to "verify" code
  that is no longer there, and it cost real time before it was spotted. The
  script uninstalls the runner before and after every run for that reason; if
  you invoke `xcodebuild test` by hand, do the same, and sanity-check with
  `strings <...>.xctest/<binary> | grep testYourNewName` when a result looks
  impossible. The runner also dies instantly if launched from the home screen
  ("Library not loaded: @rpath/XCTest.framework/XCTest") — expected, not a
  crash in the example.
  Two environment traps, both of which make **every** test fail before the
  first assertion:
  - The script boots the *newest* iPhone when none is booted. On an iOS 27
    beta runtime the example dies at launch with `SIGTRAP` in
    `__UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption` — the
    app has no scene manifest and that runtime treats it as fatal. Pass
    `SIMULATOR_UDID=<an iOS 26 or 18 device>`.
  - The script reuses whatever answers on :8081, and Metro cannot tell whose
    project it is. Another repo's `expo start` there means the example loads
    the wrong bundle. Do not kill it: start this Metro on another port and
    point the installed app at it, no rebuild needed —
    `cd example && npx expo start --dev-client --port 8082`, then
    `xcrun simctl spawn <udid> defaults write expo.modules.universaltooltip.example RCT_jsLocation "localhost:8082"`
    (and `defaults delete` it afterwards, or `yarn ios` will look on 8082).
- **Android**: drive it with `adb shell input tap`, and screenshot with
  `adb exec-out screencap -p`. Reset the scroll position first (the list drifts
  between runs) and confirm the app is actually foreground — a stray tap on the
  home screen launches something else and the rest of the run is garbage.

## Repo traps

The npm name is `poppo`, but every native identifier still says
`UniversalTooltip`: the Expo module name (`requireNativeViewManager(
"UniversalTooltip")`), the pod, the Kotlin package `expo.modules.universaltooltip`,
the `universal-tooltip-*` nativeIDs, the example's bundle id. That is deliberate.
None of it is user-visible, and renaming it means touching Swift, Kotlin,
`expo-module.config.json`, the example's Xcode project and the XCUITest runner
id in one go, for nothing. Do not "tidy" it piecemeal — a half-renamed module
fails autolinking with no useful error.

`.gitignore` once listed bare `example/ios` and `example/android`, which hid
real sources: this package's own `TooltipRootViewGroup.kt`, the example's
`MainActivity.kt` and `AppDelegate.swift`. A directory-level exclude cannot be
narrowed afterwards, because git will not descend into it to find a negation.
Name generated paths, never a directory that also holds sources.

The compound parts (`Positioner`, `Popup`, `Arrow`) are read off the elements
written inside `Root`. They cannot be wrapped in a user component — React has
not rendered it yet, so there is no output to read. That is a real constraint,
not an oversight; `Root` warns in `__DEV__` when it finds no `Popup`.
