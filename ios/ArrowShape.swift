//
//  ArrowShape.swift
//  UniversalTooltip
//
//  Created by Alan Toa on 2023/8/29.
//
import SwiftUI

/// Triangle only — used behind custom RN content, which already paints
/// its own rounded body.
struct ArrowShape: Shape {
  var arrowDirection: ContentSide
  var arrowSize: CGSize
  var curveRadius: CGFloat = 4.0

  func path(in rect: CGRect) -> Path {
    var path = Path()
    switch arrowDirection {
    case .bottom:
      path.move(to: CGPoint(x: rect.midX - arrowSize.width / 2, y: rect.minY))
      path.addLine(to: CGPoint(x: rect.midX, y: rect.minY - arrowSize.height))
      path.addLine(to: CGPoint(x: rect.midX + arrowSize.width / 2, y: rect.minY))
    case .top:
      path.move(to: CGPoint(x: rect.midX - arrowSize.width / 2, y: rect.maxY))
      path.addLine(to: CGPoint(x: rect.midX, y: rect.maxY + arrowSize.height))
      path.addLine(to: CGPoint(x: rect.midX + arrowSize.width / 2, y: rect.maxY))
    case .right:
      path.move(to: CGPoint(x: rect.minX, y: rect.midY - arrowSize.width / 2))
      path.addLine(to: CGPoint(x: rect.minX - arrowSize.height, y: rect.midY))
      path.addLine(to: CGPoint(x: rect.minX, y: rect.midY + arrowSize.width / 2))
    case .left:
      path.move(to: CGPoint(x: rect.maxX, y: rect.midY - arrowSize.width / 2))
      path.addLine(to: CGPoint(x: rect.maxX + arrowSize.height, y: rect.midY))
      path.addLine(to: CGPoint(x: rect.maxX, y: rect.midY + arrowSize.width / 2))
    case .any:
      path.move(to: CGPoint(x: rect.midX - arrowSize.width / 2, y: rect.minY))
      path.addLine(to: CGPoint(x: rect.midX, y: rect.minY - arrowSize.height))
      path.addLine(to: CGPoint(x: rect.midX + arrowSize.width / 2, y: rect.minY))
    }
    path.closeSubpath()
    return path
  }
}

/// Rounded body + arrow as one path. A separate triangle sitting on a
/// `RoundedRectangle` ate the near-side corner (the "left pill, right
/// sharp" look) whenever the arrow was shifted along the edge.
struct TooltipBubbleShape: Shape {
  var arrowDirection: ContentSide
  var arrowSize: CGSize
  var cornerRadius: CGFloat
  /// Shift along the arrow edge, from the bubble center toward max X/Y.
  var arrowOffset: CGFloat

  func path(in rect: CGRect) -> Path {
    let aw = max(arrowSize.width, 1)
    let ah = max(arrowSize.height, 0)
    let r = min(max(cornerRadius, 0), min(rect.width, rect.height) / 2)
    let inset = r + aw / 2

    func clamp(_ value: CGFloat, _ lo: CGFloat, _ hi: CGFloat) -> CGFloat {
      guard hi >= lo else { return (lo + hi) / 2 }
      return min(max(value, lo), hi)
    }

    var path = Path()
    // Clockwise from the top-left corner, inserting the arrow on the
    // edge that faces the trigger.
    path.move(to: CGPoint(x: rect.minX + r, y: rect.minY))

    if arrowDirection == .bottom {
      let mid = clamp(rect.midX + arrowOffset, rect.minX + inset, rect.maxX - inset)
      path.addLine(to: CGPoint(x: mid - aw / 2, y: rect.minY))
      path.addLine(to: CGPoint(x: mid, y: rect.minY - ah))
      path.addLine(to: CGPoint(x: mid + aw / 2, y: rect.minY))
    }
    path.addLine(to: CGPoint(x: rect.maxX - r, y: rect.minY))
    path.addArc(tangent1End: CGPoint(x: rect.maxX, y: rect.minY),
                tangent2End: CGPoint(x: rect.maxX, y: rect.minY + r),
                radius: r)

    if arrowDirection == .left {
      let mid = clamp(rect.midY + arrowOffset, rect.minY + inset, rect.maxY - inset)
      path.addLine(to: CGPoint(x: rect.maxX, y: mid - aw / 2))
      path.addLine(to: CGPoint(x: rect.maxX + ah, y: mid))
      path.addLine(to: CGPoint(x: rect.maxX, y: mid + aw / 2))
    }
    path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - r))
    path.addArc(tangent1End: CGPoint(x: rect.maxX, y: rect.maxY),
                tangent2End: CGPoint(x: rect.maxX - r, y: rect.maxY),
                radius: r)

    if arrowDirection == .top || arrowDirection == .any {
      let mid = clamp(rect.midX + arrowOffset, rect.minX + inset, rect.maxX - inset)
      path.addLine(to: CGPoint(x: mid + aw / 2, y: rect.maxY))
      path.addLine(to: CGPoint(x: mid, y: rect.maxY + ah))
      path.addLine(to: CGPoint(x: mid - aw / 2, y: rect.maxY))
    }
    path.addLine(to: CGPoint(x: rect.minX + r, y: rect.maxY))
    path.addArc(tangent1End: CGPoint(x: rect.minX, y: rect.maxY),
                tangent2End: CGPoint(x: rect.minX, y: rect.maxY - r),
                radius: r)

    if arrowDirection == .right {
      let mid = clamp(rect.midY + arrowOffset, rect.minY + inset, rect.maxY - inset)
      path.addLine(to: CGPoint(x: rect.minX, y: mid + aw / 2))
      path.addLine(to: CGPoint(x: rect.minX - ah, y: mid))
      path.addLine(to: CGPoint(x: rect.minX, y: mid - aw / 2))
    }
    path.addLine(to: CGPoint(x: rect.minX, y: rect.minY + r))
    path.addArc(tangent1End: CGPoint(x: rect.minX, y: rect.minY),
                tangent2End: CGPoint(x: rect.minX + r, y: rect.minY),
                radius: r)

    path.closeSubpath()
    return path
  }
}
