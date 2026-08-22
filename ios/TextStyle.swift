//
//  TextStyle.swift
//  UniversalTooltip
//
//  Created by Alan Toa on 2022/12/31.
//
import ExpoModulesCore
import UIKit

struct TextStyle: Record {
  @Field
  var fontSize: Double = 13

  @Field
  var color: UIColor = .black

  @Field
  var fontFamily: String?

  @Field
  var fontWeight: String = "normal"

  func resolvedFont() -> UIFont {
    let size = CGFloat(fontSize > 0 ? fontSize : 13)
    if let fontFamily, let custom = UIFont(name: fontFamily, size: size) {
      return custom
    }
    return UIFont.systemFont(ofSize: size, weight: fontWeightToUIKit(fontWeight))
  }
}

func fontWeightToUIKit(_ weight: String) -> UIFont.Weight {
  switch weight {
  case "normal", "400": return .regular
  case "bold", "700": return .bold
  case "100": return .ultraLight
  case "200": return .thin
  case "300": return .light
  case "500": return .medium
  case "600": return .semibold
  case "800": return .heavy
  case "900": return .black
  default: return .regular
  }
}
