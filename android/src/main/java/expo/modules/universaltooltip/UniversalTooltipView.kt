package expo.modules.universaltooltip

import android.content.Context
import android.content.res.Resources
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.TextView
import com.facebook.react.bridge.ReactContext
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

        /** Keeps the bubble off the display edge, matching iOS. */
        private const val EDGE_MARGIN_DP = 8
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

        val host = if (!text.isNullOrEmpty()) prepareTextHost() else prepareContentHost() ?: return
        val balloon = buildBalloon(host)
        this.balloon = balloon
        chromeSignature = chromeSignature()

        val offset = dpToPx(sideOffset)
        when (side) {
            ContentSide.Bottom -> balloon.showAlignBottom(anchor, 0, offset)
            ContentSide.Right -> balloon.showAlignEnd(anchor, offset, 0)
            ContentSide.Left -> balloon.showAlignStart(anchor, -offset, 0)
            ContentSide.Top, null -> balloon.showAlignTop(anchor, 0, -offset)
        }
        // Balloon centres the popup on the trigger but slides it inward at a
        // screen edge; only now is it on screen and its real offset knowable.
        host.post { pinArrowToAnchor(host, anchor) }
    }

    /**
     * Points the arrow at the trigger's centre. Balloon's own
     * `ArrowPositionRules` cannot be used: its arrow is disabled here because
     * it is always square and would ignore an `<Arrow>`'s height.
     */
    private fun pinArrowToAnchor(host: TooltipRootViewGroup, anchor: View) {
        if (!host.isAttachedToWindow || !anchor.isAttachedToWindow) return
        val anchorPos = IntArray(2)
        val hostPos = IntArray(2)
        anchor.getLocationOnScreen(anchorPos)
        host.getLocationOnScreen(hostPos)
        val center = if (side == ContentSide.Left || side == ContentSide.Right) {
            anchorPos[1] + anchor.height / 2 - hostPos[1]
        } else {
            anchorPos[0] + anchor.width / 2 - hostPos[0]
        }
        host.setArrowCenter(center)
    }

    private val isHorizontal: Boolean
        get() = side == ContentSide.Left || side == ContentSide.Right

    private fun getBalloonAnimation(): BalloonAnimation = when (presetAnimation) {
        PresetAnimation.FadeIn -> BalloonAnimation.FADE
        PresetAnimation.ZoomIn -> BalloonAnimation.OVERSHOOT
        PresetAnimation.None -> BalloonAnimation.NONE
        null -> BalloonAnimation.FADE
    }

    /**
     * Balloon is used purely as a positioned popup window: the bubble body,
     * its corners and the arrow are all drawn by [TooltipRootViewGroup], so a
     * text bubble and a React one behave identically and an `<Arrow>`'s width
     * and height are both honoured. Balloon's own arrow is a square ImageView
     * and cannot express a 14x8 triangle.
     */
    private fun buildBalloon(host: TooltipRootViewGroup): Balloon {
        val gen = generation
        return Balloon.Builder(context)
            .setLayout(host)
            .setWidth(BalloonSizeSpec.WRAP)
            .setHeight(BalloonSizeSpec.WRAP)
            .setIsVisibleArrow(false)
            .setPadding(0)
            .setMarginHorizontal(if (isHorizontal) 0 else EDGE_MARGIN_DP)
            .setBackgroundColor(Color.TRANSPARENT)
            .setCornerRadius(0f)
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
            .build()
    }

    /** Drops anything we added ourselves, never React's popup slot. */
    private fun clearBubbleBody(host: TooltipRootViewGroup) {
        for (index in host.childCount - 1 downTo 0) {
            val child = host.getChildAt(index)
            if (child !== slotView) {
                host.removeViewAt(index)
            }
        }
    }

    private fun applyArrowChrome(host: TooltipRootViewGroup) {
        host.setArrow(
            side = side ?: ContentSide.Top,
            widthPx = dpToPx(arrowWidth),
            heightPx = dpToPx(arrowHeight),
            color = bgColor,
            cornerRadiusPx = borderRadius * density,
        )
        // A Balloon keeps its content view attached until it is garbage
        // collected; detach before handing the same host to the next one.
        (host.parent as? ViewGroup)?.removeView(host)
    }

    /** The natively drawn text bubble: a plain TextView on a rounded fill. */
    private fun prepareTextHost(): TooltipRootViewGroup {
        val host = host()
        host.dispatchesToReact = false
        host.setBubbleFrame(0, 0, 0, 0)
        clearBubbleBody(host)
        slotView?.visibility = View.GONE

        val style = containerStyle
        val label = TextView(context).apply {
            text = this@UniversalTooltipView.text
            setTextColor(textStyle?.color ?: Color.BLACK)
            setTextSize(
                TypedValue.COMPLEX_UNIT_SP,
                textStyle?.fontSize?.let { if (it == 0f) null else it } ?: 13f,
            )
            typeface = convertFontWeightToTypeface(textStyle?.fontWeight ?: "normal")
            gravity = Gravity.START
            includeFontPadding = false
            maxWidth = dpToPx(this@UniversalTooltipView.maxWidth)
            setPadding(
                dpToPx(style?.paddingLeft ?: 10),
                dpToPx(style?.paddingTop ?: 10),
                dpToPx(style?.paddingRight ?: 10),
                dpToPx(style?.paddingBottom ?: 10),
            )
            background = GradientDrawable().apply {
                setColor(bgColor)
                cornerRadius = borderRadius * density
            }
        }
        host.addView(
            label,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT,
                FrameLayout.LayoutParams.WRAP_CONTENT,
            ),
        )
        applyArrowChrome(host)
        return host
    }

    /**
     * The React-rendered bubble. Returns null while React has not laid it out
     * yet; [onLayout] retries.
     */
    private fun prepareContentHost(): TooltipRootViewGroup? {
        val host = contentHost ?: return null
        val body = bodyView() ?: return null
        if (body.width == 0 || body.height == 0) return null

        host.dispatchesToReact = true
        clearBubbleBody(host)
        body.visibility = View.VISIBLE
        slotView?.visibility = View.VISIBLE
        val slot = slotView
        val offsetLeft = if (slot == null) body.left else bodyOffsetX(body, slot)
        val offsetTop = if (slot == null) body.top else bodyOffsetY(body, slot)
        host.setBubbleFrame(offsetLeft, offsetTop, body.width, body.height)
        applyArrowChrome(host)
        return host
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
