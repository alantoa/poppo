import XCTest

/// Run with `yarn test:ios`.
///
/// Note that running these installs a second app on the simulator —
/// `universaltooltipexampleUITests-Runner` — whose icon sits next to the real
/// one. Launching it by hand always dies instantly with "Library not loaded:
/// @rpath/XCTest.framework/XCTest", because XCTest is only injected when the
/// test harness starts it. That is expected; it is not the example crashing.
/// Remove it with:
///
///     xcrun simctl uninstall booted expo.modules.universaltooltip.example.uitests.xctrunner
///
/// Covers the parts of the popup that only a real touch can prove: the popup
/// is presented in an overlay on the window, outside React Native's own view
/// hierarchy, so every press inside it has to travel back to JS through a
/// touch handler the library attaches by hand.
final class PopupInteractionUITests: XCTestCase {
  private var app: XCUIApplication!

  /// The dev bundle is fetched from Metro on launch.
  private let launchTimeout: TimeInterval = 120
  private let uiTimeout: TimeInterval = 10

  override func setUpWithError() throws {
    continueAfterFailure = false
    app = XCUIApplication()
    app.launch()
    XCTAssertTrue(
      app.staticTexts["Playground"].waitForExistence(timeout: launchTimeout),
      "The example app never finished loading its bundle."
    )
  }

  private func trigger(_ identifier: String) -> XCUIElement {
    app.descendants(matching: .any).matching(identifier: identifier).firstMatch
  }

  /// The toast section sits below the fold on a phone. XCTest does not scroll
  /// on its own, so swipe until the control is hittable.
  private func scrollTo(_ element: XCUIElement) {
    for _ in 0..<6 where !element.isHittable {
      app.scrollViews.firstMatch.swipeUp()
    }
    XCTAssertTrue(element.isHittable, "Could not scroll \(element) into view.")
  }

  private func waitToVanish(_ element: XCUIElement, timeout: TimeInterval) {
    let gone = NSPredicate(format: "exists == false")
    expectation(for: gone, evaluatedWith: element)
    waitForExpectations(timeout: timeout)
  }

  /// Taps by coordinate rather than by element: while a popup is open the
  /// overlay covers everything behind it, so no element back there is
  /// "hittable" as far as XCTest is concerned — which is the behaviour under
  /// test. Low and to the left, clear of the bubbles and of every control.
  private func tapOutsidePopup() {
    app.coordinate(withNormalizedOffset: CGVector(dx: 0.12, dy: 0.85)).tap()
  }

  func testRichTooltipOpensOnTap() {
    let bubble = app.staticTexts["Network available"]
    XCTAssertFalse(bubble.exists, "The tooltip should start closed.")

    trigger("demo-tooltip-rich").tap()

    XCTAssertTrue(
      bubble.waitForExistence(timeout: uiTimeout),
      "Pressing the trigger did not open the rich tooltip."
    )
  }

  /// A tooltip is a hint: its content does not take touches, and pressing it
  /// puts it away.
  func testPressingTooltipContentDismissesIt() {
    trigger("demo-tooltip-rich").tap()
    // React exposes the text as more than one element, so address the query
    // rather than an element that has to resolve to exactly one match.
    let bubble = app.staticTexts.matching(identifier: "Network available")
    let shown = NSPredicate(format: "count > 0")
    expectation(for: shown, evaluatedWith: bubble)
    waitForExpectations(timeout: uiTimeout)

    bubble.element(boundBy: 0).tap()

    let gone = NSPredicate(format: "count == 0")
    expectation(for: gone, evaluatedWith: bubble)
    waitForExpectations(timeout: uiTimeout)
  }

  /// A popover is a surface: pressing its content is the content's business,
  /// never a dismissal — even where nothing handles the press.
  func testPressInsidePopoverContentDoesNotDismissIt() {
    trigger("demo-popover-confirm").tap()
    let title = app.staticTexts["Remove download?"]
    XCTAssertTrue(title.waitForExistence(timeout: uiTimeout))

    app.staticTexts["Buttons inside popovers stay interactive on every platform."]
      .firstMatch
      .tap()

    // A dismissal would still be playing its exit animation right now, so give
    // it longer than that before believing the popup survived.
    Thread.sleep(forTimeInterval: 1)
    XCTAssertTrue(
      title.exists,
      "Pressing the popover's own content closed it."
    )
  }

  /// A button inside the popover has to reach JS. The toast it raises is
  /// rendered by React, so its appearance proves the round trip.
  func testButtonInsidePopoverReachesJS() {
    trigger("demo-popover-confirm").tap()
    XCTAssertTrue(
      app.staticTexts["Remove download?"].waitForExistence(timeout: uiTimeout),
      "The popover did not open."
    )

    trigger("demo-popover-remove").tap()

    XCTAssertTrue(
      app.staticTexts["Download removed"].waitForExistence(timeout: uiTimeout),
      "onPress inside the popover never reached JS — no toast was raised."
    )
  }

  func testTapOutsideDismissesThePopup() {
    trigger("demo-tooltip-rich").tap()
    let bubble = app.staticTexts["Network available"]
    XCTAssertTrue(bubble.waitForExistence(timeout: uiTimeout))

    tapOutsidePopup()

    let gone = NSPredicate(format: "exists == false")
    expectation(for: gone, evaluatedWith: bubble)
    waitForExpectations(timeout: uiTimeout)
  }

  /// A natively drawn text bubble is the other rendering path, and it closes
  /// when tapped.
  func testTextBubbleOpensAndDismissesOnTap() {
    // The same string labels the row, so the bubble is the second copy.
    let copies = app.staticTexts.matching(identifier: "Saved to your library")
    let initial = copies.count

    trigger("demo-tooltip-text").tap()

    let opened = NSPredicate(format: "count == %d", initial + 1)
    expectation(for: opened, evaluatedWith: copies)
    waitForExpectations(timeout: uiTimeout)

    // The bubble's copy is the hittable one — the row's own label sits under
    // the overlay. Which of the two the query lists first varies by iOS.
    let bubble = copies.allElementsBoundByIndex.first { $0.isHittable }
    XCTAssertNotNil(bubble, "No hittable copy of the bubble text was found.")
    bubble?.tap()

    let closed = NSPredicate(format: "count == %d", initial)
    expectation(for: closed, evaluatedWith: copies)
    waitForExpectations(timeout: uiTimeout)
  }

  /// Every side opens on a real press. The bubble repeats the chip's own
  /// label, so a second copy of that string means the popup is up.
  func testEachPlacementOpens() {
    for side in ["top", "bottom", "left", "right"] {
      let label = side.prefix(1).uppercased() + side.dropFirst()
      let copies = app.staticTexts.matching(identifier: label)
      let initial = copies.count

      trigger("demo-tooltip-\(side)").tap()

      let opened = NSPredicate(format: "count == %d", initial + 1)
      expectation(for: opened, evaluatedWith: copies)
      waitForExpectations(timeout: uiTimeout)

      tapOutsidePopup()
      let closed = NSPredicate(format: "count == %d", initial)
      expectation(for: closed, evaluatedWith: copies)
      waitForExpectations(timeout: uiTimeout)
    }
  }

  // MARK: Toast

  /// A toast under a finger must not expire. The default timeout is 5 s; the
  /// hold lasts longer than that, and the toast has to still be there when
  /// the finger lifts — then go away on its own once the timer resumes.
  func testHoldingAToastPausesItsTimer() {
    let button = trigger("demo-toast-title")
    scrollTo(button)
    button.tap()

    // React Native exposes a Text as two nested StaticTexts with the same
    // label; `press` needs exactly one.
    let toast = app.staticTexts["Saved"].firstMatch
    XCTAssertTrue(toast.waitForExistence(timeout: uiTimeout))

    toast.press(forDuration: 6.5)
    XCTAssertTrue(
      toast.exists,
      "The toast expired while it was being held."
    )

    // Whatever was left of the 5 s runs from here.
    waitToVanish(toast, timeout: uiTimeout)
  }

  /// The default `overflow: "queue"`: a second toast waits for the first
  /// (3 s in the example) and then gets its own full timeout.
  func testQueueOverflowHoldsTheSecondToast() {
    let button = trigger("demo-toast-burst")
    scrollTo(button)
    button.tap()
    button.tap()

    let first = app.staticTexts["Message 1"]
    let second = app.staticTexts["Message 2"]
    XCTAssertTrue(first.waitForExistence(timeout: uiTimeout))
    Thread.sleep(forTimeInterval: 1)
    XCTAssertFalse(second.exists, "The queued toast showed before its turn.")

    XCTAssertTrue(
      second.waitForExistence(timeout: uiTimeout),
      "The queued toast never got promoted."
    )
    waitToVanish(first, timeout: uiTimeout)
  }

  /// `overflow: "replace"`: the newest toast shows at once and the one it
  /// replaces animates out.
  func testReplaceOverflowShowsTheNewestAtOnce() {
    let replace = trigger("segment-replace")
    scrollTo(replace)
    replace.tap()

    let button = trigger("demo-toast-burst")
    scrollTo(button)
    button.tap()
    button.tap()

    let second = app.staticTexts["Message 2"]
    XCTAssertTrue(
      second.waitForExistence(timeout: 2),
      "The replacing toast did not show immediately."
    )
    waitToVanish(app.staticTexts["Message 1"], timeout: uiTimeout)
    XCTAssertTrue(second.exists)
  }

  func testPopupSurvivesRepeatedOpenAndClose() {
    let bubble = app.staticTexts["Network available"]
    for pass in 1...3 {
      trigger("demo-tooltip-rich").tap()
      XCTAssertTrue(
        bubble.waitForExistence(timeout: uiTimeout),
        "The tooltip failed to open on pass \(pass)."
      )
      tapOutsidePopup()
      let gone = NSPredicate(format: "exists == false")
      expectation(for: gone, evaluatedWith: bubble)
      waitForExpectations(timeout: uiTimeout)
    }
  }
}
