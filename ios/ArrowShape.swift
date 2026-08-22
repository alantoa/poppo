//
//  ArrowShape.swift
//  UniversalTooltip
//
//  Created by Alan Toa on 2023/8/29.
//
import UIKit

/// Bubble geometry, in the bubble's own coordinate space. The arrow always
/// sticks out of `rect` on the side that faces the trigger, so every layer
/// drawing these paths has to keep `masksToBounds` off.
enum TooltipShape {
  /// Where the arrow tip sits along the edge it grows from: an x for the
  /// vertical sides, a y for the horizontal ones. Clamped so the triangle
  /// never eats into a rounded corner.
  static func clampArrowCenter(
    _ center: CGFloat,
    rect: CGRect,
    side: ContentSide,
    arrowWidth: CGFloat,
    cornerRadius: CGFloat
  ) -> CGFloat {
    let inset = cornerRadius + arrowWidth / 2
    let lower: CGFloat
    let upper: CGFloat
    if side.isHorizontal {
      lower = rect.minY + inset
      upper = rect.maxY - inset
    } else {
      lower = rect.minX + inset
      upper = rect.maxX - inset
    }
    guard upper >= lower else { return (lower + upper) / 2 }
    return min(max(center, lower), upper)
  }

  /// Triangle only — used behind custom React content, which paints its own
  /// rounded body. `overlap` sinks the base into that body so the seam
  /// between the two layers cannot show through.
  static func arrowPath(
    rect: CGRect,
    side: ContentSide,
    arrowSize: CGSize,
    arrowCenter: CGFloat,
    overlap: CGFloat = 0.5
  ) -> UIBezierPath {
    let aw = max(arrowSize.width, 1)
    let ah = max(arrowSize.height, 0)
    let path = UIBezierPath()
    switch side.resolved {
    case .top, .any:
      let base = rect.maxY - overlap
      path.move(to: CGPoint(x: arrowCenter - aw / 2, y: base))
      path.addLine(to: CGPoint(x: arrowCenter, y: rect.maxY + ah))
      path.addLine(to: CGPoint(x: arrowCenter + aw / 2, y: base))
    case .bottom:
      let base = rect.minY + overlap
      path.move(to: CGPoint(x: arrowCenter - aw / 2, y: base))
      path.addLine(to: CGPoint(x: arrowCenter, y: rect.minY - ah))
      path.addLine(to: CGPoint(x: arrowCenter + aw / 2, y: base))
    case .left:
      let base = rect.maxX - overlap
      path.move(to: CGPoint(x: base, y: arrowCenter - aw / 2))
      path.addLine(to: CGPoint(x: rect.maxX + ah, y: arrowCenter))
      path.addLine(to: CGPoint(x: base, y: arrowCenter + aw / 2))
    case .right:
      let base = rect.minX + overlap
      path.move(to: CGPoint(x: base, y: arrowCenter - aw / 2))
      path.addLine(to: CGPoint(x: rect.minX - ah, y: arrowCenter))
      path.addLine(to: CGPoint(x: base, y: arrowCenter + aw / 2))
    }
    path.close()
    return path
  }

  /// Rounded body + arrow as one path, for the natively drawn text bubble.
  /// A separate triangle sitting on a rounded rectangle ate the near-side
  /// corner whenever the arrow was shifted along the edge.
  static func bubblePath(
    rect: CGRect,
    side: ContentSide,
    arrowSize: CGSize,
    cornerRadius: CGFloat,
    arrowCenter: CGFloat
  ) -> UIBezierPath {
    let aw = max(arrowSize.width, 1)
    let ah = max(arrowSize.height, 0)
    let r = min(max(cornerRadius, 0), min(rect.width, rect.height) / 2)
    let resolved = side.resolved
    let mid = clampArrowCenter(
      arrowCenter,
      rect: rect,
      side: resolved,
      arrowWidth: aw,
      cornerRadius: r
    )

    let path = UIBezierPath()
    // Clockwise from the top-left corner, inserting the arrow on the edge
    // that faces the trigger.
    path.move(to: CGPoint(x: rect.minX + r, y: rect.minY))

    if resolved == .bottom {
      path.addLine(to: CGPoint(x: mid - aw / 2, y: rect.minY))
      path.addLine(to: CGPoint(x: mid, y: rect.minY - ah))
      path.addLine(to: CGPoint(x: mid + aw / 2, y: rect.minY))
    }
    path.addLine(to: CGPoint(x: rect.maxX - r, y: rect.minY))
    path.addArc(
      withCenter: CGPoint(x: rect.maxX - r, y: rect.minY + r),
      radius: r, startAngle: -.pi / 2, endAngle: 0, clockwise: true
    )

    if resolved == .left {
      path.addLine(to: CGPoint(x: rect.maxX, y: mid - aw / 2))
      path.addLine(to: CGPoint(x: rect.maxX + ah, y: mid))
      path.addLine(to: CGPoint(x: rect.maxX, y: mid + aw / 2))
    }
    path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - r))
    path.addArc(
      withCenter: CGPoint(x: rect.maxX - r, y: rect.maxY - r),
      radius: r, startAngle: 0, endAngle: .pi / 2, clockwise: true
    )

    if resolved == .top {
      path.addLine(to: CGPoint(x: mid + aw / 2, y: rect.maxY))
      path.addLine(to: CGPoint(x: mid, y: rect.maxY + ah))
      path.addLine(to: CGPoint(x: mid - aw / 2, y: rect.maxY))
    }
    path.addLine(to: CGPoint(x: rect.minX + r, y: rect.maxY))
    path.addArc(
      withCenter: CGPoint(x: rect.minX + r, y: rect.maxY - r),
      radius: r, startAngle: .pi / 2, endAngle: .pi, clockwise: true
    )

    if resolved == .right {
      path.addLine(to: CGPoint(x: rect.minX, y: mid + aw / 2))
      path.addLine(to: CGPoint(x: rect.minX - ah, y: mid))
      path.addLine(to: CGPoint(x: rect.minX, y: mid - aw / 2))
    }
    path.addLine(to: CGPoint(x: rect.minX, y: rect.minY + r))
    path.addArc(
      withCenter: CGPoint(x: rect.minX + r, y: rect.minY + r),
      radius: r, startAngle: .pi, endAngle: 3 * .pi / 2, clockwise: true
    )

    path.close()
    return path
  }
}

/// A view whose backing layer is a shape layer, so a bubble or arrow can be
/// drawn outside the view's own bounds.
final class TooltipShapeView: UIView {
  override class var layerClass: AnyClass { CAShapeLayer.self }

  var shapeLayer: CAShapeLayer {
    // swiftlint:disable:next force_cast
    layer as! CAShapeLayer
  }

  init() {
    super.init(frame: .zero)
    backgroundColor = .clear
    isUserInteractionEnabled = false
    layer.masksToBounds = false
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }
}
