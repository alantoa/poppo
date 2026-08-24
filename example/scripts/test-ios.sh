#!/usr/bin/env bash
# Runs the XCUITest suite against a simulator.
#
# The destination is resolved at run time instead of being pinned in
# package.json: `name=iPhone 16 Pro` implies `OS=latest`, which matches nothing
# once a newer runtime is installed that has no such device.
#
# Override with SIMULATOR_UDID=... if you want a specific one.
set -uo pipefail

udid="${SIMULATOR_UDID:-}"

if [ -z "$udid" ]; then
  udid=$(xcrun simctl list devices booted |
    grep -oE '[0-9A-F]{8}-([0-9A-F]{4}-){3}[0-9A-F]{12}' |
    head -1)
fi

if [ -z "$udid" ]; then
  echo "No booted simulator; booting the newest available iPhone." >&2
  udid=$(xcrun simctl list devices available |
    grep -E '^ +iPhone' |
    grep -oE '[0-9A-F]{8}-([0-9A-F]{4}-){3}[0-9A-F]{12}' |
    tail -1)
  [ -n "$udid" ] || { echo "No iPhone simulator available." >&2; exit 1; }
  xcrun simctl boot "$udid"
fi

echo "Testing on simulator $udid" >&2
exec xcodebuild test \
  -workspace ios/universaltooltipexample.xcworkspace \
  -scheme universaltooltipexample \
  -destination "platform=iOS Simulator,id=$udid" \
  "$@"
