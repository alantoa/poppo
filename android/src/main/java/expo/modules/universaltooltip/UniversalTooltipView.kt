package expo.modules.universaltooltip

import android.content.Context
import android.content.res.Resources
import android.graphics.Color
import android.view.View
import android.view.ViewGroup
import com.facebook.react.bridge.ReactContext
import com.skydoves.balloon.ArrowOrientation
import com.skydoves.balloon.ArrowOrientationRules
import com.skydoves.balloon.ArrowPositionRules
import com.skydoves.balloon.Balloon
import com.skydoves.balloon.BalloonAnimation
import com.skydoves.balloon.BalloonSizeSpec
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import expo.modules.universaltooltip.enums.ContentSide
import expo.modules.universaltooltip.enums.PresetAnimation
import expo.modules.universaltooltip.records.ContainerStyle
import expo.modules.universaltooltip.records.TextStyle
import expo.modules.universaltooltip.records.convertFontWeightToTypeface
import kotlin.properties.Delegates

/**
 * Anchors a Balloon popup to a React trigger.
 *
 * React mounts two children: the trigger and — for custom (non-text) popups —
 * the popup slot. The slot never belongs to this view: it is moved into
 * [contentHost] the moment it is mounted, so this view stays exactly
 * trigger-sized and React's own layout is never disturbed. React's child
 * indices keep working because [UniversalTooltipModule] routes `addView` /
 * `removeViewAt` through [reactChildren].
 */
class UniversalTooltipView(context: Context, appContext: AppContext) :
    ExpoView(context, appContext) {
    companion object {
        const val CONTENT_NATIVE_ID = "universal-tooltip-content"
        const val BODY_NATIVE_ID = "universal-tooltip-body"
    }

    val onTap by EventDispatcher()
    val onDismiss by EventDispatcher()

    var opened: Boolean by Delegates.observable(false) { _, oldValue, newValue ->
        if (oldValue == newValue) return@observable
        if (newValue) {
            openRequested = true
            post { tryOpen() }
        } else {
            dismiss()
        }
    }
    var side: ContentSide? = null
    var text: String? = null
    var maxWidth: Int =
        (Resources.getSystem().displayMetrics.widthPixels /
            Resources.getSystem().displayMetrics.density).toInt()
    var arrowWidth = 10
    var arrowHeight = 5
    var presetAnimation: PresetAnimation? = null
    var showDuration: Double = 300.0
    var containerStyle: ContainerStyle? = null
    var textStyle: TextStyle? = null
    var sideOffset: Int = 5
    var disableTapToDismiss: Boolean = false
    var borderRadius: Float = 5f
    var disableDismissWhenTouchOutside = false
    var bgColor: Int = Color.BLACK

    private var balloon: Balloon? = null
    private var openRequested = false
    private var chromeSignature: String? = null
    /**
     * Bumped whenever a Balloon is thrown away for reasons React does not need
     * to hear about. Its dismiss listener compares against this and stays
     * quiet, so a rebuild is not reported to JS as the user closing the popup.
     */
    private var generation = 0
    private var contentHost: TooltipRootViewGroup? = null
    private var slotView: View? = null

    /** React's view of this container's children, in React's own order. */
    private val reactChildren = mutableListOf<View>()

    init {
        clipChildren = false
        clipToPadding = false
        clipToOutline = false
    }

    /**
     * Everything Balloon bakes into the popup when it is built. React can
     * change any of it while the popup is on screen — a theme switch repaints
     * the bubble — and the only way to follow is to build a new Balloon.
     */
    private fun chromeSignature(): String = listOf(
        bgColor, arrowWidth, arrowHeight, side, borderRadius, text,
        textStyle?.color, textStyle?.fontSize, textStyle?.fontWeight,
        containerStyle?.paddingTop, containerStyle?.paddingBottom,
        containerStyle?.paddingLeft, containerStyle?.paddingRight,
        maxWidth, presetAnimation
    ).joinToString("|")

    fun onPropsDidUpdate() {
        if (balloon?.isShowing != true) return
        val next = chromeSignature()
        if (next == chromeSignature) return
        chromeSignature = next
        generation++
        balloon?.dismiss()
        balloon = null
        openRequested = true
        post { tryOpen() }
    }

    private val density: Float get() = resources.displayMetrics.density

    private fun dpToPx(dp: Int): Int = (dp * density).toInt()

    // region React child management

    private fun nativeIdOf(view: View): String? = try {
        view.getTag(com.facebook.react.R.id.view_tag_native_id) as? String
    } catch (_: Throwable) {
        null
    }

    private fun findByNativeId(view: View, id: String): View? {
        if (nativeIdOf(view) == id) return view
        if (view is ViewGroup) {
            for (i in 0 until view.childCount) {
                findByNativeId(view.getChildAt(i) ?: continue, id)?.let { return it }
            }
        }
        return null
    }

    private fun host(): TooltipRootViewGroup {
        contentHost?.let { return it }
        val reactContext = context as? ReactContext ?: appContext.reactContext as? ReactContext
        val created = TooltipRootViewGroup(context, reactContext)
        contentHost = created
        return created
    }

    fun addReactChild(child: View, index: Int) {
        reactChildren.add(index.coerceIn(0, reactChildren.size), child)
        if (findByNativeId(child, CONTENT_NATIVE_ID) != null) {
            slotView = child
            host().addView(child)
        } else {
            addView(child, triggerIndexOf(child))
        }
    }

    fun removeReactChildAt(index: Int) {
        val child = reactChildren.getOrNull(index) ?: return
        reactChildren.removeAt(index)
        detach(child)
    }

    fun removeReactChild(child: View) {
        reactChildren.remove(child)
        detach(child)
    }

    fun reactChildCount(): Int = reactChildren.size

    fun reactChildAt(index: Int): View? = reactChildren.getOrNull(index)

    private fun detach(child: View) {
        if (child === slotView) {
            dismiss()
            slotView = null
        }
        (child.parent as? ViewGroup)?.removeView(child)
    }

    /** Physical index of a trigger child, ignoring the slot. */
    private fun triggerIndexOf(child: View): Int {
        var physical = 0
        for (candidate in reactChildren) {
            if (candidate === child) break
            if (candidate !== slotView) physical++
        }
        return physical.coerceIn(0, childCount)
    }

    // endregion

    // React Native positions every child itself, so the LinearLayout that
    // `ExpoView` extends must not measure or arrange them — its horizontal
    // pass used to push the trigger sideways by the width of its sibling,
    // which is what cropped the "Show" chips out of their card.
    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        setMeasuredDimension(
            MeasureSpec.getSize(widthMeasureSpec),
            MeasureSpec.getSize(heightMeasureSpec)
        )
    }

    override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
        if (openRequested && balloon?.isShowing != true) {
            post { tryOpen() }
        }
    }

    private fun anchorView(): View = getChildAt(0) ?: this

    private fun bodyView(): View? = slotView?.let { findByNativeId(it, BODY_NATIVE_ID) }

    /**
     * Opens as soon as React has laid out both the trigger and the bubble.
     * Called again after every layout pass until that is true, so a popup that
     * mounts opened (`defaultOpen`) is not lost to the first, unmeasured pass.
     */
    private fun tryOpen() {
        if (!openRequested || balloon?.isShowing == true) return
        if (!isAttachedToWindow) return
        val anchor = anchorView()
        if (anchor.width == 0 || anchor.height == 0) return

        val balloon = if (!text.isNullOrEmpty()) {
            buildTextBalloon()
        } else {
            buildContentBalloon() ?: return
        }
        this.balloon = balloon
        chromeSignature = chromeSignature()

        val offset = dpToPx(sideOffset)
        when (side) {
            ContentSide.Bottom -> balloon.showAlignBottom(anchor, 0, offset)
            ContentSide.Right -> balloon.showAlignEnd(anchor, offset, 0)
            ContentSide.Left -> balloon.showAlignStart(anchor, -offset, 0)
            ContentSide.Top, null -> balloon.showAlignTop(anchor, 0, -offset)
        }
    }

    private fun getBalloonAnimation(): BalloonAnimation = when (presetAnimation) {
        PresetAnimation.FadeIn -> BalloonAnimation.FADE
        PresetAnimation.ZoomIn -> BalloonAnimation.OVERSHOOT
        PresetAnimation.None -> BalloonAnimation.NONE
        null -> BalloonAnimation.FADE
    }

    private fun getArrowOrientation(): ArrowOrientation = when (side) {
        ContentSide.Bottom -> ArrowOrientation.BOTTOM
        ContentSide.Right -> ArrowOrientation.START
        ContentSide.Left -> ArrowOrientation.END
        ContentSide.Top, null -> ArrowOrientation.TOP
    }

    private fun isHorizontal(): Boolean =
        side == ContentSide.Left || side == ContentSide.Right

    // Shared chrome so the body and arrow are one Balloon shape, pinned
    // to the trigger.
    //
    // `ALIGN_ANCHOR` keeps the arrow on the trigger when the bubble is pushed
    // inward by a screen edge, but Balloon only resolves it correctly for the
    // vertical sides — on the horizontal ones it dropped the arrow onto the
    // bubble's bottom corner. `showAlignStart` / `showAlignEnd` center the
    // bubble on the trigger anyway, so the balloon's own middle is the right
    // spot there.
    private fun Balloon.Builder.applyArrowChrome(): Balloon.Builder {
        val gen = generation
        return this
            .setArrowColor(bgColor)
            .setArrowSize(arrowWidth.coerceAtLeast(1))
            .setArrowPosition(0.5f)
            .setArrowPositionRules(
                if (isHorizontal()) ArrowPositionRules.ALIGN_BALLOON
                else ArrowPositionRules.ALIGN_ANCHOR
            )
            .setArrowAlignAnchorPadding(0)
            .setArrowOrientation(getArrowOrientation())
            .setArrowOrientationRules(ArrowOrientationRules.ALIGN_ANCHOR)
            .setElevation(0)
            .setOnBalloonClickListener {
                onTap(mapOf())
                if (!disableTapToDismiss) {
                    dismiss()
                }
            }
            .setOnBalloonDismissListener {
                if (gen == generation) {
                    openRequested = false
                    onDismiss(mapOf())
                }
            }
            .setBalloonAnimation(getBalloonAnimation())
            .setDismissWhenTouchOutside(!disableDismissWhenTouchOutside)
    }

    private fun buildTextBalloon(): Balloon {
        val style = containerStyle
        val fontSize = textStyle?.fontSize?.let { if (it == 0.0f) null else it } ?: 13f
        return Balloon.Builder(context)
            .setText(text!!)
            .setTextColor(textStyle?.color ?: Color.BLACK)
            .setTextSize(fontSize)
            .setTextGravity(android.view.Gravity.START)
            .setTextTypeface(convertFontWeightToTypeface(textStyle?.fontWeight ?: "normal"))
            .setMaxWidth(maxWidth)
            .setPaddingTop(style?.paddingTop ?: 10)
            .setPaddingBottom(style?.paddingBottom ?: 10)
            .setPaddingLeft(style?.paddingLeft ?: 10)
            .setPaddingRight(style?.paddingRight ?: 10)
            .setBackgroundColor(bgColor)
            .setCornerRadius(borderRadius)
            .applyArrowChrome()
            .build()
    }

    /**
     * Custom content already paints its own fill and radius, so the Balloon
     * body is transparent and zero-padded — only the arrow is native.
     * Returns null while React has not laid the bubble out yet; [onLayout]
     * retries.
     */
    private fun buildContentBalloon(): Balloon? {
        val host = contentHost ?: return null
        val body = bodyView() ?: return null
        if (body.width == 0 || body.height == 0) return null

        val slot = slotView
        val offsetLeft = if (slot == null) body.left else bodyOffsetX(body, slot)
        val offsetTop = if (slot == null) body.top else bodyOffsetY(body, slot)
        host.setBubbleFrame(offsetLeft, offsetTop, body.width, body.height)
        // A Balloon keeps its content view attached until it is garbage
        // collected; detach before handing the same host to the next one.
        (host.parent as? ViewGroup)?.removeView(host)

        return Balloon.Builder(context)
            .setLayout(host)
            .setWidth(BalloonSizeSpec.WRAP)
            .setHeight(BalloonSizeSpec.WRAP)
            .setPadding(0)
            .setMargin(0)
            .setBackgroundColor(Color.TRANSPARENT)
            .setCornerRadius(0f)
            .applyArrowChrome()
            .build()
    }

    private fun bodyOffsetX(body: View, slot: View): Int {
        var offset = 0
        var view: View? = body
        while (view != null && view !== slot) {
            offset += view.left
            view = view.parent as? View
        }
        return offset
    }

    private fun bodyOffsetY(body: View, slot: View): Int {
        var offset = 0
        var view: View? = body
        while (view != null && view !== slot) {
            offset += view.top
            view = view.parent as? View
        }
        return offset
    }

    private fun dismiss() {
        openRequested = false
        balloon?.dismiss()
        balloon = null
    }

    override fun onDetachedFromWindow() {
        dismiss()
        super.onDetachedFromWindow()
    }
}
