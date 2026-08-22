import ExpoModulesCore

enum ContentSide: String, Enumerable {
  case any
  case top
  case bottom
  case right
  case left

  /// `.any` is the default coming from JS and means "top unless it does not fit".
  var resolved: ContentSide {
    self == .any ? .top : self
  }

  var isHorizontal: Bool {
    self == .left || self == .right
  }

  var opposite: ContentSide {
    switch self {
    case .top: return .bottom
    case .bottom: return .top
    case .left: return .right
    case .right: return .left
    case .any: return .bottom
    }
  }
}
