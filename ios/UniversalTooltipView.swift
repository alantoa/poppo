import ExpoModulesCore
import UIKit

/// Full-window container for a presented popup.
///
/// It only swallows touches that land outside the bubble, and only while an
/// outside tap is meant to dismiss — otherwise the app underneath keeps
/// working exactly as it did before the popup opened.
final class TooltipOverlayView: UIView {
  weak var owner: UniversalTooltipView?
  var dismissesOnOutsideTap = true

  override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
    guard let hit = super.hitTest(point, with: event) else { return nil }
    if hit === self {
      return dismissesOnOutsideTap ? self : nil
    }
    return hit
  }

  override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) {
    super.touchesEnded(touches, with: event)
    owner?.handleOutsideTap()
  }
}

/// CADisplayLink retains its target, so it is given a proxy: a view that is
/// torn down while a popup is on screen must still be able to deallocate.
private final class DisplayLinkProxy: NSObject {
  weak var target: UniversalTooltipView?

  init(target: UniversalTooltipView) {
    self.target = target
  }

  @objc func tick() {
    target?.onDisplayLink()
  }
}

/// Anchors a popup — a natively drawn text bubble, or arbitrary React Native
/// content — to a trigger rendered by React.
///
/// React mounts two children: the trigger, and (for custom content) the popup
/// slot. The slot never becomes a subview of this view: it is moved into
/// `contentHost` when it mounts and only ever travels between that host and
/// the presented bubble. React keeps laying it out either way — Fabric writes
/// frames straight onto the views — so the bubble is fully measured before it
/// is ever shown, and React's own child bookkeeping is never disturbed.
class UniversalTooltipView: ExpoView {
  static let contentNativeID = "universal-tooltip-content"
  static let bodyNativeID = "universal-tooltip-body"

  /// Keeps the bubble off the display edge.
  private static let edgePadding: CGFloat = 8
  /// Stop retrying a present that never becomes possible.
  private static let openTimeout: CFTimeInterval = 2

  // MARK: - Props

  var bubbleBackgroundColor: UIColor = .clear
  var side: ContentSide = .any
  var presetAnimation: PresetAnimation = .fadeIn
  var showDuration: CGFloat = 0.3
  var dismissDuration: CGFloat = 0.3
  var cornerRadius: CGFloat = 5
  var text: String?
  var maxWidth: Double?
  var arrowWidth: Double = 20
  var arrowHeight: Double = 10
  var containerStyle: ContainerStyle?
  var textStyle = TextStyle(fontSize: 14, color: .black, fontWeight: "normal")
  var sideOffset: CGFloat = 1
  var disableTapToDismiss = false
  var disableDrag = false
  var disableDismissWhenTouchOutside = false

  var opened = false {
    didSet {
      guard oldValue != opened else { return }
      if opened {
        requestOpen()
      } else {
        dismiss(notify: false)
      }
    }
  }

  let onDismiss = EventDispatcher()
  let onTap = EventDispatcher()

  // MARK: - State

  /// React's view of this container's children, in React's own order.
  private var reactChildren: [UIView] = []
  private var slotView: UIView?
  private let contentHost = UIView()
  private var touchHandler: NSObject?

  private var overlay: TooltipOverlayView?
  private var bubbleContainer: UIView?
  private var shapeView: TooltipShapeView?
  private var label: UILabel?

  private var isPresented = false
  private var openRequested = false
  private var openDeadline: CFTimeInterval = 0
  private var displayLink: CADisplayLink?
  private var lastSourceFrame: CGRect = .null

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = false
    contentHost.clipsToBounds = false
    contentHost.backgroundColor = .clear
  }

  deinit {
    displayLink?.invalidate()
  }

  // MARK: - React children

  private func nativeID(of view: UIView) -> String? {
    for key in ["nativeID", "nativeId"] {
      if view.responds(to: NSSelectorFromString(key)),
         let value = view.value(forKey: key) as? String,
         !value.isEmpty {
        return value
      }
    }
    if let identifier = view.accessibilityIdentifier, !identifier.isEmpty {
      return identifier
    }
    return nil
  }

  private func findView(in view: UIView, nativeID id: String) -> UIView? {
    if nativeID(of: view) == id {
      return view
    }
    for sub in view.subviews {
      if let found = findView(in: sub, nativeID: id) {
        return found
      }
    }
    return nil
  }

  /// Position of a trigger child among the views that stay in this container.
  private func triggerIndex(of child: UIView) -> Int {
    var index = 0
    for candidate in reactChildren {
      if candidate === child { break }
      if candidate !== slotView { index += 1 }
    }
    return min(index, subviews.count)
  }

  // Content is identified by nativeID, never by child index: Fabric mounts the
  // trigger first on some passes and the popup first on others. `super` is
  // deliberately not called — it asserts that every child is a subview at
  // exactly `index`, which cannot hold while the popup lives in its own host.
  override func mountChildComponentView(_ childComponentView: UIView, index: Int) {
    reactChildren.insert(childComponentView, at: max(0, min(index, reactChildren.count)))
    if findView(in: childComponentView, nativeID: Self.contentNativeID) != nil {
      slotView = childComponentView
      childComponentView.removeFromSuperview()
      contentHost.addSubview(childComponentView)
      attachTouchHandler(to: childComponentView)
    } else {
      insertSubview(childComponentView, at: triggerIndex(of: childComponentView))
    }
  }

  override func unmountChildComponentView(_ childComponentView: UIView, index: Int) {
    if let existing = reactChildren.firstIndex(of: childComponentView) {
      reactChildren.remove(at: existing)
    }
    if childComponentView === slotView {
      detachTouchHandler(from: childComponentView)
      slotView = nil
      dismiss(notify: false)
    }
    childComponentView.removeFromSuperview()
  }

  // The popup is rendered outside the React root view, so React Native's touch
  // pipeline cannot see it. Attaching a dedicated RCTSurfaceTouchHandler — the
  // same mechanism RCTModalHostView uses — restores onPress and friends inside
  // the bubble. The class is resolved at runtime to avoid a hard header
  // dependency on React-RCTFabric, which may ship as a prebuilt framework.
  private func attachTouchHandler(to view: UIView) {
    guard touchHandler == nil,
          let handlerClass = NSClassFromString("RCTSurfaceTouchHandler") as? NSObject.Type else {
      return
    }
    let handler = handlerClass.init()
    let attachSelector = Selector(("attachToView:"))
    guard handler.responds(to: attachSelector) else { return }
    _ = handler.perform(attachSelector, with: view)
    touchHandler = handler
  }

  private func detachTouchHandler(from view: UIView) {
    let detachSelector = Selector(("detachFromView:"))
    if let handler = touchHandler, handler.responds(to: detachSelector) {
      _ = handler.perform(detachSelector, with: view)
    }
    touchHandler = nil
  }

  // MARK: - Geometry

  private var hasNativeText: Bool {
    if let text, !text.isEmpty { return true }
    return false
  }

  /// The trigger, never the popup: using the whole Expo view as the source
  /// would include the popup wrapper and pin the arrow to that larger box.
  private var triggerView: UIView? {
    subviews.first { $0 !== contentHost }
  }

  /// `convert(_:to:)` only returns window coordinates once this view is in a
  /// window and laid out; anything else is not a real anchor yet.
  private func sourceFrame() -> CGRect? {
    guard let window, bounds.width > 0, bounds.height > 0 else { return nil }
    let trigger = triggerView ?? self
    let frame = trigger.convert(trigger.bounds, to: window)
    guard frame.width > 0, frame.height > 0 else { return nil }
    return frame
  }

  /// The React view that paints the bubble. The slot around it is a
  /// window-wide measuring box (see `popupSlotStyle` on the JS side).
  private func bodyView() -> UIView? {
    guard let slotView else { return nil }
    return findView(in: slotView, nativeID: Self.bodyNativeID) ?? slotView.subviews.first
  }

  private func textBubbleSize(availableWidth: CGFloat) -> CGSize {
    let insets = paddingInsets()
    let font = textStyle.resolvedFont()
    var wrapWidth = availableWidth - insets.left - insets.right
    if let maxWidth, maxWidth > 0 {
      wrapWidth = min(wrapWidth, CGFloat(maxWidth) - insets.left - insets.right)
    }
    wrapWidth = max(wrapWidth, 1)
    let bounding = (text ?? "").boundingRect(
      with: CGSize(width: wrapWidth, height: .greatestFiniteMagnitude),
      options: [.usesLineFragmentOrigin, .usesFontLeading],
      attributes: [.font: font],
      context: nil
    )
    return CGSize(
      width: ceil(bounding.width) + insets.left + insets.right,
      height: ceil(bounding.height) + insets.top + insets.bottom
    )
  }

  /// Where the bubble sits inside its slot. Normally the origin, but the
  /// popup's own styles can nudge it.
  private func bodyOffsetInSlot() -> CGPoint {
    guard let slotView, let body = bodyView(), body !== slotView else { return .zero }
    return body.convert(CGPoint.zero, to: slotView)
  }

  private func paddingInsets() -> UIEdgeInsets {
    UIEdgeInsets(
      top: containerStyle?.paddingTop ?? 10,
      left: containerStyle?.paddingLeft ?? 10,
      bottom: containerStyle?.paddingBottom ?? 10,
      right: containerStyle?.paddingRight ?? 10
    )
  }

  private struct Placement {
    let side: ContentSide
    let frame: CGRect
    /// Where the arrow points, in the bubble's own coordinate space.
    let arrowCenter: CGFloat
  }

  /// Places `size` next to `source`, flipping to the opposite side when the
  /// requested one does not fit and clamping the bubble inside the safe area.
  private func placement(for size: CGSize, source: CGRect, in window: UIWindow) -> Placement {
    let pad = Self.edgePadding
    let insets = window.safeAreaInsets
    let limits = CGRect(
      x: insets.left + pad,
      y: insets.top + pad,
      width: max(window.bounds.width - insets.left - insets.right - pad * 2, 1),
      height: max(window.bounds.height - insets.top - insets.bottom - pad * 2, 1)
    )
    let gap = sideOffset + CGFloat(arrowHeight)

    func fits(_ candidate: ContentSide) -> Bool {
      switch candidate {
      case .top, .any: return source.minY - gap - size.height >= limits.minY
      case .bottom: return source.maxY + gap + size.height <= limits.maxY
      case .left: return source.minX - gap - size.width >= limits.minX
      case .right: return source.maxX + gap + size.width <= limits.maxX
      }
    }

    var resolved = side.resolved
    if !fits(resolved), fits(resolved.opposite) {
      resolved = resolved.opposite
    }

    var origin = CGPoint.zero
    switch resolved {
    case .top, .any:
      origin = CGPoint(x: source.midX - size.width / 2, y: source.minY - gap - size.height)
    case .bottom:
      origin = CGPoint(x: source.midX - size.width / 2, y: source.maxY + gap)
    case .left:
      origin = CGPoint(x: source.minX - gap - size.width, y: source.midY - size.height / 2)
    case .right:
      origin = CGPoint(x: source.maxX + gap, y: source.midY - size.height / 2)
    }

    // Clamp along the cross axis only — moving along the main axis would
    // detach the bubble from the trigger it belongs to.
    if resolved.isHorizontal {
      origin.y = clamp(origin.y, limits.minY, max(limits.maxY - size.height, limits.minY))
    } else {
      origin.x = clamp(origin.x, limits.minX, max(limits.maxX - size.width, limits.minX))
    }

    let frame = CGRect(origin: origin, size: size)
    let arrowCenter = TooltipShape.clampArrowCenter(
      resolved.isHorizontal ? source.midY - frame.minY : source.midX - frame.minX,
      rect: CGRect(origin: .zero, size: size),
      side: resolved,
      arrowWidth: CGFloat(arrowWidth),
      cornerRadius: cornerRadius
    )
    return Placement(side: resolved, frame: frame, arrowCenter: arrowCenter)
  }

  private func clamp(_ value: CGFloat, _ lower: CGFloat, _ upper: CGFloat) -> CGFloat {
    guard upper >= lower else { return lower }
    return min(max(value, lower), upper)
  }

  // MARK: - Presenting

  private func requestOpen() {
    openRequested = true
    openDeadline = CACurrentMediaTime() + Self.openTimeout
    startDisplayLink()
    // A popup opened straight from a press can usually present on the spot;
    // the display link only covers the passes where React has not measured
    // the bubble yet.
    tryPresent()
  }

  private func startDisplayLink() {
    guard displayLink == nil else { return }
    let link = CADisplayLink(
      target: DisplayLinkProxy(target: self),
      selector: #selector(DisplayLinkProxy.tick)
    )
    link.add(to: .main, forMode: .common)
    displayLink = link
  }

  private func stopDisplayLink() {
    displayLink?.invalidate()
    displayLink = nil
  }

  @objc fileprivate func onDisplayLink() {
    if isPresented {
      updatePlacement()
      return
    }
    guard openRequested else {
      stopDisplayLink()
      return
    }
    if CACurrentMediaTime() > openDeadline {
      openRequested = false
      stopDisplayLink()
      return
    }
    tryPresent()
  }

  private func tryPresent() {
    guard openRequested, !isPresented else { return }
    guard let window, let source = sourceFrame() else { return }

    let size: CGSize
    if hasNativeText {
      size = textBubbleSize(availableWidth: window.bounds.width - Self.edgePadding * 2)
    } else {
      guard let body = bodyView(), body.bounds.width > 1, body.bounds.height > 1 else { return }
      size = body.bounds.size
    }
    guard size.width > 1, size.height > 1 else { return }

    let overlay = TooltipOverlayView(frame: window.bounds)
    overlay.owner = self
    overlay.backgroundColor = .clear
    overlay.clipsToBounds = false
    overlay.dismissesOnOutsideTap = !disableDismissWhenTouchOutside
    overlay.autoresizingMask = [.flexibleWidth, .flexibleHeight]

    let container = UIView()
    container.clipsToBounds = false
    container.backgroundColor = .clear
    overlay.addSubview(container)

    let shape = TooltipShapeView()
    shape.shapeLayer.fillColor = bubbleBackgroundColor.cgColor
    container.addSubview(shape)

    if hasNativeText {
      let textLabel = UILabel()
      textLabel.numberOfLines = 0
      textLabel.lineBreakMode = .byWordWrapping
      textLabel.textAlignment = .left
      textLabel.font = textStyle.resolvedFont()
      textLabel.textColor = textStyle.color
      textLabel.text = text
      container.addSubview(textLabel)
      label = textLabel
      let tap = UITapGestureRecognizer(target: self, action: #selector(handleBubbleTap))
      container.addGestureRecognizer(tap)
    } else {
      container.addSubview(contentHost)
    }

    window.addSubview(overlay)
    self.overlay = overlay
    bubbleContainer = container
    shapeView = shape
    isPresented = true
    openRequested = false
    lastSourceFrame = .null

    applyPlacement(placement(for: size, source: source, in: window))
    animateIn(container)
    startDisplayLink()
  }

  /// Re-runs the geometry against the trigger's current position, so a popup
  /// stays glued to its anchor while the page behind it scrolls.
  private func updatePlacement() {
    guard isPresented, let window, let container = bubbleContainer else { return }
    guard let source = sourceFrame(), source.intersects(window.bounds) else {
      // The trigger scrolled out of the screen — a popup with nothing left to
      // point at just clamps itself to an edge, so close it instead.
      dismiss(notify: true)
      return
    }
    let size: CGSize
    if hasNativeText {
      size = container.bounds.size
    } else {
      guard let body = bodyView(), body.bounds.width > 1, body.bounds.height > 1 else { return }
      size = body.bounds.size
    }
    guard source != lastSourceFrame || size != container.bounds.size else { return }
    lastSourceFrame = source
    applyPlacement(placement(for: size, source: source, in: window))
  }

  private func applyPlacement(_ placement: Placement) {
    guard let container = bubbleContainer, let shape = shapeView else { return }
    lastSourceFrame = sourceFrame() ?? lastSourceFrame

    // bounds + center rather than frame: the container may be mid-animation
    // with a scale transform, and assigning `frame` would cancel it.
    container.bounds = CGRect(origin: .zero, size: placement.frame.size)
    container.center = CGPoint(x: placement.frame.midX, y: placement.frame.midY)

    let bounds = CGRect(origin: .zero, size: placement.frame.size)
    shape.frame = bounds
    let arrowSize = CGSize(width: CGFloat(arrowWidth), height: CGFloat(arrowHeight))
    if hasNativeText {
      shape.shapeLayer.path = TooltipShape.bubblePath(
        rect: bounds,
        side: placement.side,
        arrowSize: arrowSize,
        cornerRadius: cornerRadius,
        arrowCenter: placement.arrowCenter
      ).cgPath
      label?.frame = bounds.inset(by: paddingInsets())
    } else {
      shape.shapeLayer.path = TooltipShape.arrowPath(
        rect: bounds,
        side: placement.side,
        arrowSize: arrowSize,
        arrowCenter: placement.arrowCenter
      ).cgPath
      // The slot is a window-wide measuring box; shift it so the bubble it
      // holds lands exactly on the container's origin.
      let offset = bodyOffsetInSlot()
      contentHost.frame = CGRect(
        x: -offset.x,
        y: -offset.y,
        width: bounds.width + offset.x,
        height: bounds.height + offset.y
      )
    }
  }

  private func animateIn(_ container: UIView) {
    switch presetAnimation {
    case PresetAnimation.none:
      return
    case .zoomIn:
      container.alpha = 0
      container.transform = CGAffineTransform(scaleX: 0.85, y: 0.85)
      UIView.animate(
        withDuration: max(Double(showDuration), 0.01),
        delay: 0,
        usingSpringWithDamping: 0.78,
        initialSpringVelocity: 0.4,
        options: [.allowUserInteraction, .beginFromCurrentState]
      ) {
        container.alpha = 1
        container.transform = .identity
      }
    case .fade, .fadeIn:
      container.alpha = 0
      UIView.animate(
        withDuration: max(Double(showDuration), 0.01),
        delay: 0,
        options: [.curveEaseOut, .allowUserInteraction, .beginFromCurrentState]
      ) {
        container.alpha = 1
      }
    }
  }

  /// Props arrive one at a time and can change while the popup is on screen —
  /// a theme switch repaints the bubble, so the native chrome has to follow.
  func didUpdateProps() {
    guard isPresented, let window, let source = sourceFrame() else { return }
    shapeView?.shapeLayer.fillColor = bubbleBackgroundColor.cgColor
    let size: CGSize
    if hasNativeText {
      label?.font = textStyle.resolvedFont()
      label?.textColor = textStyle.color
      label?.text = text
      size = textBubbleSize(availableWidth: window.bounds.width - Self.edgePadding * 2)
    } else {
      guard let body = bodyView(), body.bounds.width > 1, body.bounds.height > 1 else { return }
      size = body.bounds.size
    }
    applyPlacement(placement(for: size, source: source, in: window))
  }

  @objc private func handleBubbleTap() {
    onTap()
    if !disableTapToDismiss {
      dismiss(notify: true)
    }
  }

  func handleOutsideTap() {
    guard !disableDismissWhenTouchOutside else { return }
    dismiss(notify: true)
  }

  /// - Parameter notify: whether JS still has to be told the popup closed.
  ///   Closing because `open` went false is already known upstream.
  func dismiss(notify: Bool) {
    openRequested = false
    guard isPresented else {
      stopDisplayLink()
      return
    }
    isPresented = false
    stopDisplayLink()

    let overlay = self.overlay
    let container = bubbleContainer
    self.overlay = nil
    bubbleContainer = nil
    shapeView = nil
    label = nil

    // Bring the popup slot home once the overlay is gone, so React keeps
    // measuring it and the next open is instant.
    let finish = { [weak self] in
      // Only if it is still here: a popup reopened during the fade-out has
      // already moved the slot into its new container.
      if self?.contentHost.superview === container {
        self?.contentHost.removeFromSuperview()
      }
      overlay?.removeFromSuperview()
    }
    if presetAnimation == PresetAnimation.none {
      finish()
    } else {
      UIView.animate(
        withDuration: max(Double(dismissDuration), 0.01),
        delay: 0,
        options: [.curveEaseIn, .beginFromCurrentState]
      ) {
        container?.alpha = 0
      } completion: { _ in
        finish()
      }
    }

    if notify {
      onDismiss()
    }
  }

  // MARK: - Lifecycle

  override func layoutSubviews() {
    super.layoutSubviews()
    if isPresented {
      updatePlacement()
    } else if openRequested {
      tryPresent()
    }
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window == nil {
      dismiss(notify: false)
    }
  }
}
