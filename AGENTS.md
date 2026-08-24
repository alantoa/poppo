# Working on universal-tooltip

An Expo module: anchored popups (tooltip, popover) plus a toast manager, for
iOS, Android and web. `src/` is the JS surface, `ios/` is Swift, `android/` is
Kotlin, and `example/` is a playground app that doubles as the test bed.

This file records what is **not** discoverable by reading the code — the
platform behaviour the implementation is shaped around, and the invariants that
break silently when violated. Everything else, read from the source.

## Commands

```sh
yarn lint                       # eslint (src only)
npx tsc --noEmit                # library
npx tsc --noEmit -p example/tsconfig.json
yarn prepare                    # build to build/ (does NOT clean; see below)

cd example && yarn start        # Metro
cd example && yarn ios          # or yarn android
cd example && yarn test:ios     # XCUITest suite
```

Two build steps have non-obvious prerequisites, both of which fail with errors
that do not name the cause:

- Gradle needs `ANDROID_HOME`, or it reports "SDK location not found":
  `cd example/android && ANDROID_HOME=$HOME/Library/Android/sdk ./gradlew :app:assembleDebug`
- `pod install` needs a UTF-8 locale, or CocoaPods dies inside
  `unicode_normalize` with `Encoding::CompatibilityError`:
  `cd example/ios && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pod install`

`yarn prepare` compiles without cleaning, so files deleted from `src/` linger in
`build/`. That does not reach npm — `prepublishOnly` runs `expo-module clean`
first — but do not trust `build/` after deleting a source file. `yarn clean`
first.

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

## Verifying a change

Screenshots are not enough for anything touch-related; drive it.

- **iOS**: `cd example && yarn test:ios`. There is no tap injection available
  otherwise — `simctl` has no input command, and controlling the simulator
  window from outside needs Accessibility permission that a CLI agent will not
  have. The suite covers the paths only a real touch reaches, and it has caught
  a real bug that every screenshot pass missed.
  Running it installs `universaltooltipexampleUITests-Runner` on the simulator,
  with an icon next to the real app. Launching that by hand always dies with
  "Library not loaded: @rpath/XCTest.framework/XCTest" — that is expected, not a
  crash in the example. Remove it with
  `xcrun simctl uninstall booted expo.modules.universaltooltip.example.uitests.xctrunner`.
- **Android**: drive it with `adb shell input tap`, and screenshot with
  `adb exec-out screencap -p`. Reset the scroll position first (the list drifts
  between runs) and confirm the app is actually foreground — a stray tap on the
  home screen launches something else and the rest of the run is garbage.

## Repo traps

`.gitignore` once listed bare `example/ios` and `example/android`, which hid
real sources: this package's own `TooltipRootViewGroup.kt`, the example's
`MainActivity.kt` and `AppDelegate.swift`. A directory-level exclude cannot be
narrowed afterwards, because git will not descend into it to find a negation.
Name generated paths, never a directory that also holds sources.

The compound parts (`Positioner`, `Popup`, `Arrow`) are read off the elements
written inside `Root`. They cannot be wrapped in a user component — React has
not rendered it yet, so there is no output to read. That is a real constraint,
not an oversight; `Root` warns in `__DEV__` when it finds no `Popup`.
