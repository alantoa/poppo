import ExpoModulesCore

import Popovers
import SwiftUI

final class TooltipContentHost: UIView {
  private var frameObserver: NSKeyValueObservation?

  func attach(_ content: UIView) {
    if content.superview !== self {
      content.removeFromSuperview()
      addSubview(content)
    }
    content.transform = .identity
    content.alpha = 1
    content.isUserInteractionEnabled = true
    content.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    pin(content)
    frameObserver = content.observe(\.frame, options: [.new]) { [weak self] view, _ in
      guard let self else { return }
      if view.frame != self.bounds {
        self.pin(view)
      }
    }
  }

  private func pin(_ content: UIView) {
    content.transform = .identity
    if bounds.width > 0, bounds.height > 0 {
      content.frame = bounds
    }
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    if let content = subviews.first {
      pin(content)
    }
  }
}

struct RepresentedUIView: UIViewRepresentable {
  var contentView: UIView

  func makeUIView(context: Context) -> TooltipContentHost {
    let host = TooltipContentHost()
    host.backgroundColor = .clear
    host.clipsToBounds = false
    host.attach(contentView)
    return host
  }

  func updateUIView(_ host: TooltipContentHost, context: Context) {
    host.attach(contentView)
  }
}

struct PopoverModifier: ViewModifier {
  let isActive: Bool
  let side: ContentSide
  let offset: CGFloat = 10
  let presetAnimation: PresetAnimation
  func body(content: Content) -> some View {
    switch presetAnimation {
      case .zoomIn:
        content
          .scaleEffect(self.isActive ? 1 : 0)
          .animation(.spring())
      default:
        content
          .opacity(self.isActive ? 1: 0)
          .offset(x: self.side.toSideOffsetX(offset: offset, isActive: isActive), y: self.side.toSideOffsetY(offset: offset, isActive:isActive))
    }

  }
}



class UniversalTooltipView: ExpoView {
  var contentView: UIView?
  var bubbleBackgroundColor: UIColor = .clear
  var side: ContentSide = .any
  var presetAnimation : PresetAnimation = .fadeIn
  var showDuration: CGFloat = CGFloat(0.3)
  var dismissDuration: CGFloat = CGFloat(0.3)
  var cornerRadius : CGFloat = CGFloat(5)
  var text :String? = nil
  var maxWidth : Double?
  var contentWidth: Double = 0
  var contentHeight: Double = 0 {
    didSet {
      if opened && !isPresented && contentHeight > 0 {
        scheduleOpen()
      }
    }
  }
  var arrowWidth: Double = 20
  var arrowHeight: Double = 10
  var containerStyle : ContainerStyle?
  var textStyle : TextStyle =  TextStyle(fontSize: 14, color: .black, fontWeight: "normal")
  var sideOffset : CGFloat = 1
  var opened: Bool = false {
    didSet {
      guard oldValue != opened else { return }
      if opened {
        scheduleOpen()
      } else {
        openWorkItem?.cancel()
        openWorkItem = nil
        dismiss()
      }
    }
  }
  let onDismiss = EventDispatcher()
  let onTap = EventDispatcher()
  var disableTapToDismiss = false
  var disableDrag = false
  var disableDismissWhenTouchOutside = false
  var popover: Popover?
  private var touchHandler: NSObject?
  private var isPresented = false
  private var openWorkItem: DispatchWorkItem?

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    // Parked custom content is opacity 0. Do not clip — a trigger-sized
    // clip + Fabric culling skips later children (Confirm Pressables).
    clipsToBounds = false
  }

  /// Custom content often reports title-only height on the first layout
  /// pass. Popover snapshots `body` as AnyView at present time, so wait
  /// one frame for Pressables before locking the SwiftUI frame.
  private func scheduleOpen() {
    guard opened, !isPresented else { return }
    if hasNativeText {
      openTooltip()
      return
    }
    openWorkItem?.cancel()
    let work = DispatchWorkItem { [weak self] in
      self?.openWorkItem = nil
      self?.openTooltip()
    }
    openWorkItem = work
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.03, execute: work)
  }

  private static let contentNativeID = "universal-tooltip-content"

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

  private func isContentSlot(_ view: UIView) -> Bool {
    if nativeID(of: view) == Self.contentNativeID {
      return true
    }
    // Fabric may wrap the marked host in extra RCT views.
    return view.subviews.contains { isContentSlot($0) }
  }

  // Content is identified by nativeID, never by child index. Treating
  // index 0 as the popup hid the trigger whenever Fabric mounted the
  // button first (theme remounts, concurrent render).
  override func mountChildComponentView(_ childComponentView: UIView, index: Int) {
    // Every child goes through super so RCTViewComponentView's index
    // bookkeeping stays consistent — withholding a child shifts the sibling
    // indexes and unmounting a later sibling throws NSRangeException.
    //
    // While the popup is presented, SwiftUI reparents the content slot into
    // the popover, so `subviews` can temporarily hold fewer children than
    // Fabric believes — clamp the index instead of letting UIKit throw.
    if index > subviews.count {
      insertSubview(childComponentView, at: subviews.count)
    } else {
      super.mountChildComponentView(childComponentView, index: index)
    }
    if isContentSlot(childComponentView) {
      contentView = childComponentView
      parkContent()
      attachTouchHandler(to: childComponentView)
    } else {
      childComponentView.alpha = 1
      childComponentView.isUserInteractionEnabled = true
    }
  }

  override func unmountChildComponentView(_ childComponentView: UIView, index: Int) {
    if childComponentView == contentView {
      detachTouchHandler(from: childComponentView)
      contentView = nil
      if isPresented {
        dismiss()
      }
    }
    // While the popup is presented (or right after a dismissal), the content
    // slot lives inside the popover instead of this view, which breaks
    // RCTViewComponentView's `subviews[index]` bookkeeping and would throw
    // NSRangeException (e.g. remounting the whole tree on a theme change).
    // When the bookkeeping no longer matches, detach manually instead.
    let bookkeepingMatches =
      childComponentView.superview === self
      && index < subviews.count
      && subviews[index] === childComponentView
    if bookkeepingMatches {
      super.unmountChildComponentView(childComponentView, index: index)
    } else {
      childComponentView.removeFromSuperview()
    }
  }

  // The tooltip content is rendered inside the popover, outside the React
  // root view, so React Native's touch pipeline can't see it. Attaching a
  // dedicated RCTSurfaceTouchHandler (the same mechanism RCTModalHostView
  // uses) restores JS touch events (onPress etc.) inside the tooltip.
  // The class is resolved at runtime to avoid a hard header dependency on
  // React-RCTFabric, which may ship as a prebuilt framework.
  private func attachTouchHandler(to view: UIView) {
    guard touchHandler == nil,
          let handlerClass = NSClassFromString("RCTSurfaceTouchHandler") as? NSObject.Type else {
      return
    }
    let handler = handlerClass.init()
    let attachSelector = Selector(("attachToView:"))
    guard handler.responds(to: attachSelector) else {
      return
    }
    _ = handler.perform(attachSelector, with: view)
    touchHandler = handler
  }

  private func parkContent() {
    guard let content = contentView else { return }
    if content.superview !== self {
      insertSubview(content, at: 0)
    }
    // Keep the view in the Yoga tree (no isHidden) so children still
    // measure. Do not apply a CGAffineTransform — Fabric overwrites it
    // from JS style and the view can jump to the window origin (that's
    // the Wi‑Fi icon on the status bar).
    content.transform = .identity
    content.alpha = 0
    content.isUserInteractionEnabled = false
  }

  private func detachTouchHandler(from view: UIView) {
    let detachSelector = Selector(("detachFromView:"))
    if let handler = touchHandler, handler.responds(to: detachSelector) {
      _ = handler.perform(detachSelector, with: view)
    }
    touchHandler = nil
  }

  private func closestViewController() -> UIViewController? {
    var responder: UIResponder? = self
    while let currentResponder = responder {
      if let viewController = currentResponder as? UIViewController {
        return viewController
      }
      responder = currentResponder.next
    }
    return nil
  }

  /// Prefer the trigger (the non-content child). Using the whole Expo view
  /// as the source would include the absolutely-positioned popup wrapper and
  /// pin the arrow to that larger box instead of the button.
  private var triggerView: UIView? {
    subviews.first { $0 !== contentView }
  }

  /// The Expo view is trigger-sized (`alignSelf: flex-start` + clipped).
  /// Do not walk into descendants — after a reparent, a deep child can
  /// report a window frame on the status bar.
  private func resolvedTrigger() -> UIView {
    triggerView ?? self
  }

  /// `convert(_:to: nil)` is window coordinates only after this view is
  /// in a window and laid out. A zero / status-bar frame is what pinned
  /// the Rich Wi‑Fi bubble to the battery icons.
  private func resolvedSourceFrame() -> CGRect? {
    guard let window else { return nil }
    let trigger = resolvedTrigger()
    let source = trigger.convert(trigger.bounds, to: window)
    let statusBar = window.safeAreaInsets.top
    // The trigger lives in the page, below the safe area. A frame that
    // sits in the status bar is `convert(_:to:)` on a reparented view
    // (the parked Rich content), not the Show button.
    guard source.width >= 16,
          source.height >= 16,
          source.minY >= statusBar else {
      return nil
    }
    return source
  }

  /// Shift the arrow from the bubble center so it stays on the trigger
  /// center when the popover is pushed inward to stay on-screen.
  ///
  /// `context.frame` is `.zero` until Popovers finishes `sizeReader`.
  /// Treating that as a real frame shoved the arrow to the far edge
  /// (source.midX - 0) and the triangle ate the right-hand corners.
  private func arrowOffset(source: CGRect, popover: CGRect, contentSize: CGSize) -> CGSize {
    guard popover.width > 1, popover.height > 1 else { return .zero }
    let inset = max(cornerRadius, 6)
    switch side {
    case .left, .right:
      let raw = source.midY - popover.midY
      let limit = max(0, contentSize.height / 2 - CGFloat(arrowWidth) / 2 - inset)
      return CGSize(width: 0, height: min(max(raw, -limit), limit))
    default:
      let raw = source.midX - popover.midX
      let limit = max(0, contentSize.width / 2 - CGFloat(arrowWidth) / 2 - inset)
      return CGSize(width: min(max(raw, -limit), limit), height: 0)
    }
  }

  private func arrowEdgeOffset(source: CGRect, popover: CGRect, contentSize: CGSize) -> CGFloat {
    let offset = arrowOffset(source: source, popover: popover, contentSize: contentSize)
    switch side {
    case .left, .right:
      return offset.height
    default:
      return offset.width
    }
  }

  @ViewBuilder
  private func arrowLayer(contentSize: CGSize, context: Popover.Context) -> some View {
    let offset = arrowOffset(
      source: context.attributes.sourceFrame(),
      popover: context.frame,
      contentSize: contentSize
    )
    ArrowShape(
      arrowDirection: side,
      arrowSize: CGSize(width: arrowWidth, height: arrowHeight),
      curveRadius: 4
    )
    .fill(Color(bubbleBackgroundColor))
    .frame(width: contentSize.width, height: contentSize.height)
    .offset(x: offset.width, y: offset.height)
    .allowsHitTesting(false)
  }

  func fallbackTooltip() -> some View {
    let top = containerStyle?.paddingTop ?? 10.0
    let right = containerStyle?.paddingRight ?? 10.0
    let bottom = containerStyle?.paddingBottom ?? 10.0
    let left = containerStyle?.paddingLeft ?? 10.0

    return PopoverReader { context in
      // Do not put a GeometryReader in the background. It takes the
      // proposed width (the window), so sizeReader thought the bubble
      // was ~402pt wide, parked it on the left, and jammed the arrow
      // into the right-hand corners.
      let size = context.frame.size
      let edge = self.arrowEdgeOffset(
        source: context.attributes.sourceFrame(),
        popover: context.frame,
        contentSize: size.width > 1 ? size : CGSize(width: 1, height: 1)
      )
      Text(self.text ?? "")
        .font(.system(size: CGFloat(self.textStyle.fontSize), weight: fontWeightToSwiftUI(self.textStyle.fontWeight), design: .default))
        .multilineTextAlignment(.leading)
        // maxWidth is a wrap cap only. `.frame(maxWidth:)` alone expands to
        // the proposed size (usually the screen), which made short labels
        // sit in a 260pt-wide bubble. Hug the text, then cap wrapping.
        .frame(maxWidth: self.maxWidth.map { CGFloat($0) }, alignment: .leading)
        .fixedSize(horizontal: true, vertical: false)
        .padding(EdgeInsets(top: top, leading: left, bottom: bottom, trailing: right))
        .foregroundColor(Color(self.textStyle.color))
        .background(
          TooltipBubbleShape(
            arrowDirection: self.side,
            arrowSize: CGSize(width: self.arrowWidth, height: self.arrowHeight),
            cornerRadius: self.cornerRadius,
            arrowOffset: edge
          )
          .fill(Color(self.bubbleBackgroundColor))
        )
        // Reserve layout space so the protruding arrow is not clipped
        // and sizeReader includes it. Custom content keeps the arrow
        // outside the RN view, so only the text bubble does this.
        .padding(.top, self.side == .bottom ? self.arrowHeight : 0)
        .padding(.bottom, (self.side == .top || self.side == .any) ? self.arrowHeight : 0)
        .padding(.leading, self.side == .right ? self.arrowHeight : 0)
        .padding(.trailing, self.side == .left ? self.arrowHeight : 0)
    }
  }

  private var hasNativeText: Bool {
    if let text, !text.isEmpty { return true }
    return false
  }

  // The bubble (background, corner radius, padding, ...) is rendered by React
  // Native itself, so the full ViewStyle works out of the box. The native side
  // only draws the arrow, filled with the color derived from the content's
  // `style.backgroundColor` on the JS side.
  //
  // Text-only popups must always use `fallbackTooltip`. After a remount
  // (e.g. theme change) the zero-size JS placeholder can inherit the
  // trigger's frame; treating that as custom content draws only the arrow.
  private func subtreeExtent(of view: UIView) -> CGSize {
    var width = max(view.bounds.width, view.frame.width)
    var height = max(view.bounds.height, view.frame.height)
    for sub in view.subviews where !sub.isHidden {
      let child = subtreeExtent(of: sub)
      width = max(width, sub.frame.minX + child.width)
      height = max(height, sub.frame.minY + child.height)
    }
    return CGSize(width: width, height: height)
  }

  private func resolvedContentSize() -> CGSize {
    guard let content = contentView else { return .zero }
    let laidOut = subtreeExtent(of: content)
    var width = contentWidth > 0 ? max(laidOut.width, CGFloat(contentWidth)) : laidOut.width
    var height = contentHeight > 0 ? max(laidOut.height, CGFloat(contentHeight)) : laidOut.height
    // Absolute + flex:1 measured as ~window height (64×774). Popovers
    // then placed that strip above the trigger and clamped it onto the
    // status bar — which is the stray Wi‑Fi icon.
    let maxH = (window?.bounds.height ?? 800) * 0.5
    let maxW = (window?.bounds.width ?? 400) * 0.92
    if height > maxH {
      let inner = content.subviews.first.map { subtreeExtent(of: $0).height } ?? 0
      height = inner > 8 && inner <= maxH ? inner : min(height, 120)
    }
    if width > maxW {
      width = min(max(laidOut.width, 64), maxW)
    }
    return CGSize(width: width, height: height)
  }

  var body: some View {
    Group {
      if hasNativeText {
        fallbackTooltip().onTapGesture {
          self.onTap()
        }
      } else if let validContentView = contentView {
        let contentSize = resolvedContentSize()
        if contentSize != .zero {
          // Do not add `.onTapGesture` here. SwiftUI eats the hit so RN
          // Pressables inside the bubble never receive onPress.
          PopoverReader { context in
            RepresentedUIView(contentView: validContentView)
              .frame(width: contentSize.width, height: contentSize.height)
              .background(self.arrowLayer(contentSize: contentSize, context: context))
          }
        } else {
          fallbackTooltip().onTapGesture {
            self.onTap()
          }
        }
      } else {
        fallbackTooltip().onTapGesture {
          self.onTap()
        }
      }
    }
  }

  private func applyPopoverAttributes(_ popover: inout Popover) {
    popover.attributes.sourceFrame = { [weak self] in
      self?.resolvedSourceFrame() ?? .zero
    }
    // The opening tap lands on the trigger. Without excluding that
    // frame, `.tapOutside` treats the same finger-up as a dismiss.
    popover.attributes.dismissal.excludedFrames = { [weak self] in
      guard let frame = self?.resolvedSourceFrame() else { return [] }
      return [frame]
    }
    // Text bubbles include the arrow in their layout padding. Custom
    // content does not — keep the extra inset so the RN body clears
    // the trigger.
    let gap = hasNativeText ? sideOffset : (sideOffset + arrowHeight)
    popover.attributes.sourceFrameInset = side.toSideOffset(offset: gap)
    // Keep the bubble off the display edge. `.zero` parked a right-side
    // tooltip flush with the screen, which clipped the right-hand
    // corners and made them look sharper than the left.
    popover.attributes.screenEdgePadding = .init(top: 8, left: 8, bottom: 8, right: 8)
    popover.attributes.rubberBandingMode = disableDrag ? .none : [.xAxis, .yAxis]
    popover.attributes.presentation.animation = .easeIn(duration: showDuration)
    // Enable tap-outside after the opening gesture ends. Presenting
    // with `.tapOutside` already on makes the same press dismiss it.
    popover.attributes.dismissal.mode = .none
    let customTransition: AnyTransition
    switch presetAnimation {
      case .none:
        customTransition = .identity
      case .fade:
        customTransition = .opacity
      default:
        customTransition = .modifier(
          active: PopoverModifier(isActive: false, side: self.side, presetAnimation:self.presetAnimation),
          identity: PopoverModifier(isActive: true, side: self.side, presetAnimation:self.presetAnimation)
        )
    }
    popover.attributes.presentation.transition = customTransition
    popover.attributes.position = .absolute(
      originAnchor: side.toOriginAnchorSide(),
      popoverAnchor: side.toPopoverAnchorSide()
    )
    popover.attributes.onDismiss = { [weak self] in
      guard let self else { return }
      self.isPresented = false
      self.parkContent()
      self.onDismiss()
    }
  }

  private func makePopover() -> Popover {
    var next = Popover { self.body
      .modifier(PopoverModifier(isActive: true, side: self.side, presetAnimation: self.presetAnimation))
    }
    applyPopoverAttributes(&next)
    return next
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    // Do not build `body` / RepresentedUIView here. Evaluating the
    // popover view reparents the RN content into a host and sets
    // alpha = 1, which is how the Rich Wi‑Fi bubble appeared on the
    // status bar while the tooltip was closed.
    if isPresented {
      popover?.attributes.sourceFrame = { [weak self] in
        self?.resolvedSourceFrame() ?? .zero
      }
    } else if opened, openWorkItem == nil {
      // Retry only when nothing is already scheduled. Calling
      // scheduleOpen on every layout would keep resetting the timer.
      scheduleOpen()
    }
  }

  func openTooltip() {
    guard !isPresented else { return }
    guard window != nil || closestViewController()?.view.window != nil else {
      return
    }
    // Wait until the trigger has a real window frame. Presenting from
    // `opened`'s didSet (defaultOpen / first prop pass) used a zero
    // frame; Popovers then clamped the bubble onto the status bar.
    guard resolvedSourceFrame() != nil else { return }
    // Custom content: prefer JS onLayout, but a title-only first pass
    // must not block present if the subtree already includes buttons.
    if !hasNativeText {
      contentView?.alpha = 1
      contentView?.isUserInteractionEnabled = true
      contentView?.clipsToBounds = false
      contentView?.layoutIfNeeded()
      if contentHeight <= 0 && resolvedContentSize() == .zero {
        return
      }
    }
    contentView?.clipsToBounds = false
    contentView?.layoutIfNeeded()
    var next = makePopover()
    applyPopoverAttributes(&next)
    popover = next

    var presenter = closestViewController()
    if presenter?.view.window == nil {
      presenter = window?.rootViewController
      while let current = presenter, let nextVC = current.presentedViewController {
        presenter = nextVC
      }
    }
    guard let presenter, presenter.view.window != nil else { return }

    isPresented = true
    presenter.present(next)
    popover = next

    if !disableDismissWhenTouchOutside {
      DispatchQueue.main.async { [weak self] in
        guard let self, self.isPresented else { return }
        self.popover?.attributes.dismissal.mode = .tapOutside
      }
    }
  }

  public func dismiss() {
    guard isPresented else { return }
    popover?.dismiss()
    // If present never attached a container, `dismiss()` is a no-op and
    // `onDismiss` never runs — reset so the next open is not stuck.
    if isPresented {
      isPresented = false
      parkContent()
    }
  }
}
