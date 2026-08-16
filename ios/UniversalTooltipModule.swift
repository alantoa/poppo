import ExpoModulesCore

public class UniversalTooltipModule: Module {

  // Each module class must implement the definition function. The definition consists of components
  // that describes the module's functionality and behavior.
  // See https://docs.expo.dev/modules/module-api for more details about available components.
  public func definition() -> ModuleDefinition {
    // Sets the name of the module that JavaScript code will use to refer to the module. Takes a string as an argument.
    // Can be inferred from module's class name, but it's recommended to set it explicitly for clarity.
    // The module will be accessible from `requireNativeModule('UniversalTooltip')` in JavaScript.
    Name("UniversalTooltip")
    
    View(UniversalTooltipView.self) {
      Events("onTap")
      Events("onDismiss")
      
      Prop("open") { (view, opened: Bool?) in
        view.opened = opened ?? false
      }
      Prop("side") { (view, side: ContentSide?) in
        view.side = side ?? .any
      }
      Prop("maxWidth") { (view, maxWidth: Double?) in
        view.maxWidth = maxWidth
      }
      Prop("arrowWidth") { (view, arrowWidth: Double) in
        view.arrowWidth = arrowWidth
      }
      Prop("arrowHeight") { (view, arrowWidth: Double) in
        view.arrowHeight = arrowWidth
      }
      Prop("text") { (view, text: String?) in
        view.text = text
      }
      Prop("presetAnimation") { (view, presetAnimation: PresetAnimation?) in
        view.presetAnimation = presetAnimation ?? .fadeIn
      }
      Prop("showDuration") { (view, showDuration: Double? ) in
        view.showDuration = (showDuration ?? 300)/1000
      }
      Prop("dismissDuration") { (view, dismissDuration: Double?) in
        view.dismissDuration = (dismissDuration ?? 300)/1000
      }
      Prop("containerStyle") { (view, containerStyle: ContainerStyle?) in
        view.containerStyle = containerStyle
      }
      Prop("textStyle") { (view, textStyle: TextStyle?) in
        view.textStyle = textStyle ?? TextStyle(fontSize: 13)
      }
      Prop("sideOffset") { (view, sideOffset: Double?) in
        view.sideOffset = sideOffset ?? Double(1)
      }
      Prop("disableTapToDismiss") { (view, disableTapToDismiss: Bool?) in
        view.disableTapToDismiss = disableTapToDismiss ?? false
      }
      Prop("disableDismissWhenTouchOutside") { (view, disableDismissWhenTouchOutside: Bool?) in
        view.disableDismissWhenTouchOutside = disableDismissWhenTouchOutside ?? false
      }
      Prop("borderRadius") { (view, borderRadius: Double?) in
        view.cornerRadius = borderRadius ?? CGFloat(0)
      }
      Prop("bubbleColor") { (view, bubbleColor: UIColor?) in
        view.bubbleBackgroundColor = bubbleColor ?? .clear
      }
    }
  }
}
