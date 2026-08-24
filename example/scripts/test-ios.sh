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

# The suite runs a Debug build, which loads its bundle from Metro. Start one if
# the port is not already answering, and take it down again on the way out.
metro_pid=""
if ! curl -sf -o /dev/null "http://localhost:8081/status"; then
  echo "Starting Metro..." >&2
  yarn start >/tmp/universal-tooltip-metro.log 2>&1 &
  metro_pid=$!
  trap '[ -n "$metro_pid" ] && kill "$metro_pid" 2>/dev/null' EXIT INT TERM
  for _ in $(seq 1 60); do
    curl -sf -o /dev/null "http://localhost:8081/status" && break
    sleep 1
  done
  if ! curl -sf -o /dev/null "http://localhost:8081/status"; then
    echo "Metro did not come up; see /tmp/universal-tooltip-metro.log" >&2
    exit 1
  fi
fi

# Uninstall the runner first and last. First, because leaving the previous one
# installed makes the run execute the *previous* build of the tests — a silent
# way to "verify" code that is no longer there. Last, because its icon sits
# next to the real app and dies instantly if launched by hand.
runner="expo.modules.universaltooltip.example.uitests.xctrunner"
xcrun simctl uninstall "$udid" "$runner" >/dev/null 2>&1 || true
cleanup_runner() { xcrun simctl uninstall "$udid" "$runner" >/dev/null 2>&1 || true; }

echo "Testing on simulator $udid" >&2
xcodebuild test \
  -workspace ios/universaltooltipexample.xcworkspace \
  -scheme universaltooltipexample \
  -destination "platform=iOS Simulator,id=$udid" \
  "$@"
status=$?
cleanup_runner
exit $status
