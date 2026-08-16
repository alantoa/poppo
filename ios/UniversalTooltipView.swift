import ExpoModulesCore

import Popovers
import SwiftUI

struct RepresentedUIView: UIViewRepresentable {
  var contentView: UIView

  func makeUIView(context: Context) -> UIView {
    contentView
  }

  func updateUIView(_ uiView: UIView, context: Context) {
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
  var arrowWidth: Double = 20
  var arrowHeight: Double = 10
  var containerStyle : ContainerStyle?
  var textStyle : TextStyle =  TextStyle(fontSize: 14, color: .black, fontWeight: "normal")
  var sideOffset : CGFloat = 1
  var opened: Bool = false {
    willSet(newValue) {
      if (newValue) {
        openTooltip()
      } else {
        dismiss()
      }
    }
  }
  let onDismiss = EventDispatcher()
  let onTap = EventDispatcher()
  var disableTapToDismiss = false
  var disableDismissWhenTouchOutside = false
  var popover: Popover?
  private var touchHandler: NSObject?
  private var isPresented = false

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
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
    // The marked host may sit one level down if Fabric wraps it.
    return view.subviews.contains { nativeID(of: $0) == Self.contentNativeID }
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
      childComponentView.isHidden = true
      attachTouchHandler(to: childComponentView)
    } else {
      childComponentView.isHidden = false
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

  /// Shift the arrow from the bubble center so it stays on the trigger
  /// center when the popover is pushed inward to stay on-screen.
  private func arrowOffset(source: CGRect, popover: CGRect, contentSize: CGSize) -> CGSize {
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
      Text(self.text ?? "")
        .font(.system(size: CGFloat(self.textStyle.fontSize), weight: fontWeightToSwiftUI(self.textStyle.fontWeight), design: .default))
        .frame(maxWidth: (self.maxWidth != nil) ? CGFloat(self.maxWidth ?? 200) : nil)
        .padding(EdgeInsets(top: top, leading: left, bottom: bottom, trailing: right))
        .foregroundColor(Color(self.textStyle.color))
        .background(
          RoundedRectangle(cornerRadius: self.cornerRadius)
            .fill(Color(self.bubbleBackgroundColor))
        )
        .background(
          GeometryReader { geometry in
            self.arrowLayer(contentSize: geometry.size, context: context)
          }
        )
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
  var body: some View {
    Group {
      if hasNativeText {
        fallbackTooltip().onTapGesture {
          self.onTap()
        }
      } else if let validContentView = contentView {
        let contentSize =
          validContentView.frame.size == .zero
          ? (validContentView.subviews.first?.frame.size ?? .zero)
          : validContentView.frame.size
        if contentSize != .zero {
          PopoverReader { context in
            RepresentedUIView(contentView: validContentView)
              .frame(width: contentSize.width, height: contentSize.height)
              .background(self.arrowLayer(contentSize: contentSize, context: context))
          }
          .onTapGesture {
            self.onTap()
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

  override func layoutSubviews() {
    super.layoutSubviews()
    popover = Popover { self.body
      .modifier(PopoverModifier(isActive: true, side: self.side, presetAnimation:self.presetAnimation))}
    popover?.attributes.sourceFrame = { [weak self] in
      guard let self else { return .zero }
      return (self.triggerView ?? self).windowFrame()
    }

    popover?.attributes.sourceFrameInset = self.side.toSideOffset(offset: self.sideOffset + arrowHeight)
    popover?.attributes.screenEdgePadding = .zero
    popover?.attributes.presentation.animation = .easeIn(duration: showDuration)
    popover?.attributes.dismissal.mode = self.disableDismissWhenTouchOutside ? .none: .tapOutside
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
    popover?.attributes.presentation.transition = customTransition
    popover?.attributes.position = .absolute(originAnchor: self.side.toOriginAnchorSide(), popoverAnchor: self.side.toPopoverAnchorSide())
    popover?.attributes.onDismiss = {
      self.isPresented = false
      self.contentView?.isHidden = true
      self.onDismiss()
    }

    // The `open` prop can arrive before the first layout pass (e.g. a tooltip
    // that is initially open) — at that point `popover` was still nil, so
    // present it now that it exists.
    if opened && !isPresented {
      openTooltip()
    }
  }

  func openTooltip (){
    guard let unwrappedPopover = popover, !isPresented,
          let viewController = closestViewController() else {
      // Not attached to a window yet — the next layout pass retries.
      return
    }
    isPresented = true
    // The content slot is hidden while mounted inside the trigger; unhide it
    // now that SwiftUI is about to reparent it into the popover.
    contentView?.isHidden = false
    viewController.present(unwrappedPopover)
  }
  public func dismiss(){
    isPresented = false
    contentView?.isHidden = true
    popover?.dismiss()
  }
}
