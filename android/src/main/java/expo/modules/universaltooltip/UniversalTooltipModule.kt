package expo.modules.universaltooltip

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.universaltooltip.records.ContainerStyle
import expo.modules.universaltooltip.enums.ContentSide
import expo.modules.universaltooltip.enums.PresetAnimation
import expo.modules.universaltooltip.records.TextStyle

class UniversalTooltipModule : Module() {
    // Each module class must implement the definition function. The definition consists of components
    // that describes the module's functionality and behavior.
    // See https://docs.expo.dev/modules/module-api for more details about available components.
    override fun definition() = ModuleDefinition {
        // Sets the name of the module that JavaScript code will use to refer to the module. Takes a string as an argument.
        // Can be inferred from module's class name, but it's recommended to set it explicitly for clarity.
        // The module will be accessible from `requireNativeModule('UniversalTooltip')` in JavaScript.
        Name("UniversalTooltip")

        // Enables the module to be used as a native view. Definition components that are accepted as part of
        // the view definition: Prop, Events.
        View(UniversalTooltipView::class) {
            Events(
                "onTap",
                "onDismiss",
            )
            Prop("open") { view: UniversalTooltipView, open: Boolean ->
                view.opened = open
            }
            Prop("side") { view: UniversalTooltipView, side: ContentSide ->
                view.side = side
            }
            Prop("text") { view: UniversalTooltipView, text: String ->
                view.text = text
            }
            Prop("maxWidth") { view: UniversalTooltipView, maxWidth: Int ->
                view.maxWidth = maxWidth
            }
            Prop("arrowWidth") { view: UniversalTooltipView, arrowWidth: Int ->
                view.arrowWidth = arrowWidth
            }
            Prop("arrowHeight") { view: UniversalTooltipView, arrowHeight: Int ->
                view.arrowHeight = arrowHeight
            }
            Prop("presetAnimation") { view: UniversalTooltipView, presetAnimation: PresetAnimation ->
                view.presetAnimation = presetAnimation
            }
            Prop("showDuration") { view: UniversalTooltipView, showDuration: Double ->
                view.showDuration = showDuration
            }
            Prop("containerStyle") { view: UniversalTooltipView, containerStyle: ContainerStyle ->
                view.containerStyle = containerStyle
            }
            Prop("textStyle") { view: UniversalTooltipView, textStyle: TextStyle? ->
                view.textStyle = textStyle
            }
            Prop("sideOffset") { view: UniversalTooltipView, sideOffset: Int ->
                view.sideOffset = sideOffset
            }
            Prop("disableTapToDismiss") { view: UniversalTooltipView, disableTapToDismiss: Boolean ->
                view.disableTapToDismiss = disableTapToDismiss
            }
            Prop("borderRadius") { view: UniversalTooltipView, borderRadius: Float ->
                view.borderRadius = borderRadius
            }
            Prop("backgroundColor") { view: UniversalTooltipView, backgroundColor: Int ->
                view.bgColor = backgroundColor
            }
            Prop("bubbleColor") { view: UniversalTooltipView, bubbleColor: Int ->
                view.bgColor = bubbleColor
            }
            Prop("disableDismissWhenTouchOutside") { view: UniversalTooltipView, disableDismissWhenTouchOutside: Boolean ->
                view.disableDismissWhenTouchOutside = disableDismissWhenTouchOutside
            }

        }
    }
}
