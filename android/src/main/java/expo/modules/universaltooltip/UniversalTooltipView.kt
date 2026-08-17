package expo.modules.universaltooltip

import android.content.Context
import android.content.res.Resources
import android.graphics.*
import android.view.View
import android.view.ViewGroup
import com.facebook.react.bridge.ReactContext
import com.skydoves.balloon.*
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import expo.modules.universaltooltip.enums.ContentSide
import expo.modules.universaltooltip.enums.PresetAnimation
import expo.modules.universaltooltip.records.ContainerStyle
import expo.modules.universaltooltip.records.TextStyle
import expo.modules.universaltooltip.records.convertFontWeightToTypeface
import kotlin.properties.Delegates

class UniversalTooltipView(context: Context, appContext: AppContext) :
    ExpoView(context, appContext) {
    companion object {
        const val CONTENT_NATIVE_ID = "universal-tooltip-content"
    }
    private var isViewInvalidated = false
    private var isInitialized = false
    val onTap by EventDispatcher()
    val onDismiss by EventDispatcher()
    var opened: Boolean by Delegates.observable(
        false
    ) { _, _, newValue ->
        run {
            if(isInitialized) {
                if (newValue) {
                    openTooltip()
                } else {
                    dismiss()
                }
            }
        }
    }
    private var balloon: Balloon? = null
    var side: ContentSide? = null
    var text: String? = null
    var maxWidth: Int =
        (Resources.getSystem().displayMetrics.widthPixels / Resources.getSystem().displayMetrics.density).toInt()
    var arrowWidth = 10
    var arrowHeight = 5
    private var arrowSize = (arrowHeight + arrowWidth)/2
    var presetAnimation: PresetAnimation? = null
    var showDuration: Double = 300.0
    var containerStyle: ContainerStyle? = null
    var textStyle: TextStyle? = null

    var sideOffset: Int = 5
    var disableTapToDismiss: Boolean = false
    var borderRadius: Float = 5f
    var disableDismissWhenTouchOutside = false
    var bgColor: Int = Color.BLACK
    var layoutView: View? = null

    init {
        clipChildren = false
        clipToPadding = false
        clipToOutline = false
    }

    // Absolute popup content is a child of this trigger-sized view. Yoga /
    // Android may report the wrapper as only as tall as the trigger, while
    // descendants (e.g. a button below the title) still have frames further
    // down. Walk the tree so Balloon gets the real content box.
    private fun subtreeExtent(view: View): Pair<Int, Int> {
        var right = maxOf(view.measuredWidth, view.width)
        var bottom = maxOf(view.measuredHeight, view.height)
        if (view is ViewGroup) {
            for (i in 0 until view.childCount) {
                val child = view.getChildAt(i) ?: continue
                val (childWidth, childHeight) = subtreeExtent(child)
                right = maxOf(right, child.left + childWidth)
                bottom = maxOf(bottom, child.top + childHeight)
            }
        }
        return right to bottom
    }

    private fun nativeIdOf(view: View): String? {
        return try {
            view.getTag(com.facebook.react.R.id.view_tag_native_id) as? String
        } catch (_: Throwable) {
            null
        }
    }

    private fun isContentSlot(view: View): Boolean {
        if (nativeIdOf(view) == CONTENT_NATIVE_ID) return true
        if (view is ViewGroup) {
            for (i in 0 until view.childCount) {
                if (nativeIdOf(view.getChildAt(i)) == CONTENT_NATIVE_ID) return true
            }
        }
        return false
    }

    private fun contentChild(): View? {
        for (i in 0 until childCount) {
            val child = getChildAt(i) ?: continue
            if (isContentSlot(child)) return child
        }
        return null
    }

    private fun anchorView(): View {
        for (i in 0 until childCount) {
            val child = getChildAt(i) ?: continue
            if (!isContentSlot(child)) return child
        }
        return this
    }

    private fun updateContentView() {
        if (!text.isNullOrEmpty()) return
        val contentView = contentChild() as? ViewGroup ?: return
        val inner = contentView.getChildAt(0)
        // Remeasure without the trigger's height cap so the last children
        // (buttons, extra lines) are included.
        // ReactViewGroup.onMeasure rejects UNSPECIFIED — that threw
        // "A catalyst view must have an explicit width and height" on
        // the first draw of every custom popup (app open crash).
        val widthHint = maxOf(contentView.measuredWidth, inner?.measuredWidth ?: 0)
        if (widthHint <= 0) {
            return
        }
        val maxH = maxOf(resources.displayMetrics.heightPixels / 2, 1)
        val widthSpec = MeasureSpec.makeMeasureSpec(widthHint, MeasureSpec.EXACTLY)
        val heightSpec = MeasureSpec.makeMeasureSpec(maxH, MeasureSpec.AT_MOST)
        contentView.measure(widthSpec, heightSpec)
        inner?.measure(widthSpec, heightSpec)

        val (extentW, extentH) = subtreeExtent(contentView)
        val width = maxOf(widthHint, extentW, contentView.measuredWidth, inner?.measuredWidth ?: 0)
        val height = maxOf(extentH, contentView.measuredHeight, inner?.measuredHeight ?: 0)
        if (width == 0 && height == 0) {
            // Content hasn't been laid out yet — keep it attached and retry
            // on the next draw pass.
            return
        }
        contentView.layoutParams = LayoutParams(width, height)
        removeView(contentView)
        // Host the content in a RootView-implementing container so React
        // Native touch events (e.g. onPress inside the tooltip) keep working
        // even though the popup window is outside the React root view.
        val reactContext = context as? ReactContext
            ?: appContext.reactContext as? ReactContext
        val host = TooltipRootViewGroup(context, reactContext)
        host.clipChildren = false
        host.clipToPadding = false
        host.setBackgroundColor(Color.TRANSPARENT)
        host.layoutParams = LayoutParams(width, height)
        host.addView(contentView)
        layoutView = host
    }

    override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
        super.onLayout(changed, l, t, r, b)
        if (changed) {
            isViewInvalidated = true;
        }
        if (opened) {
           openTooltip()
        }
        isInitialized = true
    }
    override fun requestLayout() {
        super.requestLayout()
        post(measureAndLayout)
    }

    private val measureAndLayout = Runnable {
        measure(
            MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY),
            MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY)
        )
        layout(left, top, right, bottom)
    }

    override fun dispatchDraw(canvas: Canvas) {
        super.dispatchDraw(canvas)
        if (isViewInvalidated) {
            // Do not extract / remeasure while closed. Parked content is
            // often still 0×0 (absolute + opacity 0); measuring it with
            // UNSPECIFIED crashed ReactViewGroup on first paint.
            if (opened) {
                updateContentView()
            }
            isViewInvalidated = false
            if (opened && balloon?.isShowing != true) {
                openTooltip()
            }
        }
    }


    private fun openTooltip() {
        if (balloon?.isShowing == true) return
        if (!text.isNullOrEmpty()) {
            openByText()
        } else {
            // The content view is extracted lazily (during the first draw);
            // when opening before that happened, extract it now.
            if (layoutView == null) {
                updateContentView()
                isViewInvalidated = false
            }
            if (layoutView == null) {
                // No content mounted yet — dispatchDraw will retry.
                return
            }
            openByContentView()
        }
        val anchor = anchorView()
        when (side) {
            ContentSide.Top -> balloon?.showAlignTop(anchor, 0, -sideOffset)
            ContentSide.Bottom -> balloon?.showAlignBottom(anchor, 0, sideOffset)
            ContentSide.Right -> balloon?.showAlignEnd(anchor, sideOffset, 0)
            ContentSide.Left -> balloon?.showAlignStart(anchor, -sideOffset, 0)
            null -> balloon?.showAlignTop(anchor)
        }
    }

    private fun getBalloonAnimation(): BalloonAnimation {
        return when (presetAnimation) {
            PresetAnimation.FadeIn -> BalloonAnimation.FADE
            PresetAnimation.ZoomIn -> BalloonAnimation.OVERSHOOT
            PresetAnimation.None -> BalloonAnimation.NONE
            null -> BalloonAnimation.FADE
        }
    }

    private fun getArrowOrientation(): ArrowOrientation {
        return when (side) {
            ContentSide.Top -> ArrowOrientation.TOP
            ContentSide.Bottom -> ArrowOrientation.BOTTOM
            ContentSide.Right -> ArrowOrientation.START
            ContentSide.Left -> ArrowOrientation.END
            null -> ArrowOrientation.TOP
        }
    }

    // Shared chrome so the body and arrow are one Balloon shape, pinned
    // to the trigger. Custom content previously skipped these and used
    // Balloon's defaults (arrow at 50% of the popup, ~4dp corners) on
    // top of the React view's own radius — that's the mismatched look.
    private fun Balloon.Builder.applyArrowChrome(): Balloon.Builder {
        return this
            .setArrowColor(bgColor)
            .setArrowSize(arrowSize)
            .setArrowPosition(0.5f)
            .setArrowPositionRules(ArrowPositionRules.ALIGN_ANCHOR)
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
                onDismiss(mapOf())
            }
            .setBalloonAnimation(getBalloonAnimation())
            .setDismissWhenTouchOutside(!disableDismissWhenTouchOutside)
    }

    private fun openByText() {
        val pdBottom: Int =
            if (containerStyle?.paddingBottom == null) 10 else containerStyle?.paddingBottom!!
        val pdTop =
            if (containerStyle?.paddingTop == null) 10 else containerStyle?.paddingTop!!
        val pdLeft =
            if (containerStyle?.paddingLeft == null) 10 else containerStyle?.paddingLeft!!
        val pdRight =
            if (containerStyle?.paddingRight == null) 10 else containerStyle?.paddingRight!!
        val fontSize = textStyle?.fontSize?.let { if (it == 0.0f) null else it } ?: 13f

        balloon = Balloon.Builder(context)
            .setText(text!!)
            .setTextColor(textStyle?.color ?: -16777216)
            .setTextSize(fontSize)
            .setTextGravity(android.view.Gravity.START)
            .setTextTypeface(convertFontWeightToTypeface(textStyle?.fontWeight ?: "normal"))
            .setMaxWidth(maxWidth)
            .setPaddingBottom(pdBottom)
            .setPaddingTop(pdTop)
            .setPaddingLeft(pdLeft)
            .setPaddingRight(pdRight)
            .setBackgroundColor(bgColor)
            .setCornerRadius(borderRadius)
            .applyArrowChrome()
            .build()
    }

    private fun openByContentView() {
        // Custom content already paints its own fill and radius. A second
        // Balloon body clipped those children (the Confirm button). Only
        // the arrow is native; the React tree is the body.
        balloon = Balloon.Builder(context)
            .setLayout(layoutView!!)
            .setWidth(BalloonSizeSpec.WRAP)
            .setHeight(BalloonSizeSpec.WRAP)
            .setPadding(0)
            .setMargin(0)
            .setBackgroundColor(Color.TRANSPARENT)
            .setCornerRadius(0f)
            .applyArrowChrome()
            .build()
    }

    private fun dismiss() {
        balloon?.dismiss()
    }

    override fun onDetachedFromWindow() {
        dismiss()
        super.onDetachedFromWindow()
    }
}
