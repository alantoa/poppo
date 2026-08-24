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
    let bubble = app.staticTexts["Network available"]
    XCTAssertTrue(bubble.waitForExistence(timeout: uiTimeout))

    bubble.firstMatch.tap()

    let gone = NSPredicate(format: "exists == false")
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

    copies.element(boundBy: initial).tap()

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
