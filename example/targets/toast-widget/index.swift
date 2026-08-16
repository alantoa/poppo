import ActivityKit
import SwiftUI
import WidgetKit

// Must match the struct defined in the app process
// (universal-tooltip/ios/ToastActivityModule.swift) — ActivityKit pairs the
// app and the widget extension by the attributes type name and Codable shape.
struct ToastActivityAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    var title: String
    var body: String?
  }
}

// Dusk Design System v2.0 — toast message (#363A3E, radius 12,
// title 16/semibold white, description 14/regular white, check icon).
private let duskBubble = Color(red: 0x36 / 255, green: 0x3A / 255, blue: 0x3E / 255)

private struct DuskToastContent: View {
  let state: ToastActivityAttributes.ContentState

  var body: some View {
    HStack(alignment: state.body == nil ? .center : .top, spacing: 12) {
      Image(systemName: "checkmark.circle.fill")
        .font(.system(size: 16))
        .foregroundColor(.white)
        .padding(.top, state.body == nil ? 0 : 2)
      VStack(alignment: .leading, spacing: 4) {
        Text(state.title)
          .font(.system(size: 16, weight: .semibold))
          .foregroundColor(.white)
        if let body = state.body {
          Text(body)
            .font(.system(size: 14))
            .foregroundColor(.white.opacity(0.85))
        }
      }
      Spacer(minLength: 0)
    }
    .padding(.leading, 16)
    .padding(.trailing, 20)
    .padding(.vertical, 12)
  }
}

@main
struct ToastWidgetBundle: WidgetBundle {
  var body: some Widget {
    ToastLiveActivity()
  }
}

struct ToastLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: ToastActivityAttributes.self) { context in
      // Lock screen / notification banner presentation.
      DuskToastContent(state: context.state)
        .activityBackgroundTint(duskBubble)
        .activitySystemActionForegroundColor(.white)
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          Image(systemName: "checkmark.circle.fill")
            .font(.system(size: 18))
            .foregroundColor(.white)
            .padding(.leading, 6)
            .padding(.top, 4)
        }
        DynamicIslandExpandedRegion(.center) {
          VStack(alignment: .leading, spacing: 4) {
            Text(context.state.title)
              .font(.system(size: 16, weight: .semibold))
              .foregroundColor(.white)
            if let body = context.state.body {
              Text(body)
                .font(.system(size: 13))
                .foregroundColor(.white.opacity(0.7))
            }
          }
        }
      } compactLeading: {
        Image(systemName: "checkmark.circle.fill")
          .foregroundColor(.white)
      } compactTrailing: {
        Text(context.state.title)
          .font(.system(size: 12, weight: .semibold))
          .foregroundColor(.white)
          .lineLimit(1)
          .frame(maxWidth: 72)
      } minimal: {
        Image(systemName: "checkmark.circle.fill")
          .foregroundColor(.white)
      }
    }
  }
}
