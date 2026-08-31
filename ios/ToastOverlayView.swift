//
//  ToastOverlayView.swift
//  UniversalTooltip
//

import ExpoModulesCore

/// The overlay covers the whole window, so it must not swallow the touches
/// that miss the toasts themselves.
private final class ToastOverlayContainer: UIView {
  override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
    guard isUserInteractionEnabled, !isHidden, alpha > 0.01 else { return nil }
    // Subviews are asked directly rather than through `super`, which refuses
    // to look inside a subview whose frame does not contain the point. A toast
    // sliding or swiping past the container's edge has to stay pressable.
    for subview in subviews.reversed() {
      let converted = subview.convert(point, from: self)
      if let hit = subview.hitTest(converted, with: event) {
        return hit
      }
    }
    return nil
  }
}

/// Hosts a toast viewport in an overlay on the window instead of in the React
/// tree where it was written.
///
/// Two things follow from that. A parent with `overflow: hidden` can no longer
/// clip a toast — and, the reason this view exists, an open React Native
/// `Modal` no longer covers it. `Modal` presents a view controller, whose
/// transition view UIKit adds to this same window, so window subviews are
/// ordered by *when* they were added.
///
/// This view leans on that: the overlay goes up only while toasts are on
/// screen, and `UIView.addSubview` appends, so attaching late — and
/// re-attaching whenever another toast arrives — puts the toasts in front of a
/// modal that was already up. The gap that leaves is a modal presented *while*
/// a toast is showing: it covers that toast until the next one raises the
/// overlay again.
class ToastOverlayView: ExpoView {
  // MARK: - Props

  /// How many toasts the viewport is rendering. Zero takes the overlay down; a
  /// rise puts it up, or raises it back to the front.
  var toastCount: Int = 0 {
    didSet {
      // Expo re-applies the whole prop map on every transaction, so this
      // setter runs constantly with a value that has not changed.
      guard oldValue != toastCount else { return }
      if toastCount > 0 {
        present(raise: toastCount > oldValue)
      } else {
        dismissOverlay()
      }
    }
  }

  // MARK: - State

  private let container = ToastOverlayContainer()
  /// React's children, in React's order. They live in `container`, never here.
  private var reactChildren: [UIView] = []
  private var touchHandler: NSObject?
  /// Set when a present was asked for before this view had a window.
  private var presentPending = false

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = false
    container.clipsToBounds = false
    container.backgroundColor = .clear
    container.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    attachTouchHandler()
  }

  // MARK: - React children

  // Children never become subviews of this view, so `super` must not run: it
  // asserts that every child sits at exactly `index` in `subviews`. React
  // keeps laying them out either way — Fabric writes frames straight onto the
  // views — so the toasts are measured whether the overlay is up or not.
  override func mountChildComponentView(_ childComponentView: UIView, index: Int) {
    let position = max(0, min(index, reactChildren.count))
    reactChildren.insert(childComponentView, at: position)
    childComponentView.removeFromSuperview()
    container.insertSubview(childComponentView, at: min(position, container.subviews.count))
  }

  override func unmountChildComponentView(_ childComponentView: UIView, index: Int) {
    if let existing = reactChildren.firstIndex(of: childComponentView) {
      reactChildren.remove(at: existing)
    }
    childComponentView.removeFromSuperview()
  }

  // MARK: - Touches

  // The overlay lives outside the React root view, so React Native's touch
  // pipeline cannot see it. A dedicated RCTSurfaceTouchHandler — the same
  // mechanism RCTModalHostView uses for a modal's content — restores
  // `onPress`, PanResponder and friends inside the toasts. One handler on the
  // container covers every child, so nothing here has to know which child is
  // which. The class is resolved at runtime to avoid a hard header dependency
  // on React-RCTFabric, which may ship as a prebuilt framework.
  private func attachTouchHandler() {
    guard touchHandler == nil,
          let handlerClass = NSClassFromString("RCTSurfaceTouchHandler") as? NSObject.Type else {
      return
    }
    let handler = handlerClass.init()
    let selector = Selector(("attachToView:"))
    guard handler.responds(to: selector) else { return }
    _ = handler.perform(selector, with: container)
    touchHandler = handler
  }

  private func detachTouchHandler() {
    let selector = Selector(("detachFromView:"))
    if let handler = touchHandler, handler.responds(to: selector) {
      _ = handler.perform(selector, with: container)
    }
    touchHandler = nil
  }

  // MARK: - Presentation

  private func resolveWindow() -> UIWindow? {
    if let window {
      return window
    }
    // The viewport can be asked to present before it has been placed in a
    // window. Fall back to the foreground scene's key window; `didMoveToWindow`
    // retries with the real one if even that is not up yet.
    return UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .first { $0.activationState == .foregroundActive }?
      .keyWindow
  }

  private func present(raise: Bool) {
    guard let window = resolveWindow() else {
      presentPending = true
      return
    }
    presentPending = false
    guard raise || container.superview !== window else { return }
    container.frame = window.bounds
    // Appends, so this both attaches the overlay and raises it to the front.
    window.addSubview(container)
    // The overlay is not in the accessibility order VoiceOver last read.
    UIAccessibility.post(notification: .layoutChanged, argument: container)
  }

  private func dismissOverlay() {
    presentPending = false
    container.removeFromSuperview()
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if presentPending, window != nil {
      present(raise: true)
    }
  }

  // MARK: - Teardown

  /// Fabric never recycles Expo views, so this — not `prepareForRecycle` — is
  /// the teardown hook React actually calls. Without it the overlay would only
  /// come down when the last reference to this view is dropped.
  ///
  /// Not marked `override`: the default implementation lives in React's
  /// `UIView (RCTComponentViewProtocol)` category, which Swift cannot see. It
  /// is a no-op there, so there is nothing to call up to.
  @objc
  func invalidate() {
    tearDown()
  }

  /// Unreachable today (see `invalidate`), kept for the day recycling becomes
  /// opt-in per view.
  override func prepareForRecycle() {
    tearDown()
    toastCount = 0
    super.prepareForRecycle()
  }

  private func tearDown() {
    detachTouchHandler()
    container.removeFromSuperview()
    for child in container.subviews {
      child.removeFromSuperview()
    }
    reactChildren.removeAll()
    presentPending = false
  }
}
