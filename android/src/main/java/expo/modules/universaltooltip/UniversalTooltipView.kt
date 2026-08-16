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
        // The wrapper is absolutely positioned, so it sizes to its own content,
        // but fall back to the inner child's measured size in case the wrapper
        // reports the trigger bounds (e.g. legacy absolute-fill content).
        val inner = contentView.getChildAt(0)
        val width =
            if (inner != null && inner.measuredWidth > contentView.measuredWidth) inner.measuredWidth
            else contentView.measuredWidth
        val height =
            if (inner != null && inner.measuredHeight > contentView.measuredHeight) inner.measuredHeight
            else contentView.measuredHeight
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
        host.layoutParams = LayoutParams(width, height)
        host.addView(contentView)
        layoutView = host
    }

    override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
        if (changed) {
            isViewInvalidated = true;
        }
        if (opened) {
           openTooltip()
        }
        isInitialized = true
        return
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
            updateContentView();
            isViewInvalidated = false;
            // An initially-open tooltip may have tried to open before the
            // content view was detached and measured — retry now.
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

    private fun openByText() {
        val pdBottom: Int =
            if (containerStyle?.paddingBottom == null) 10 else containerStyle?.paddingBottom!!
        val pdTop =
            if (containerStyle?.paddingTop == null) 10 else containerStyle?.paddingTop!!
        val pdLeft =
            if (containerStyle?.paddingLeft == null) 10 else containerStyle?.paddingRight!!
        val pdRight =
            if (containerStyle?.paddingRight == null) 10 else containerStyle?.paddingRight!!
        val fontSize = textStyle?.fontSize?.let { if (it == 0.0f) null else it } ?: 13f

        balloon = Balloon.Builder(context)
            .setText(text!!)
            .setBackgroundColor(bgColor)
                .setTextColor(textStyle?.color ?: -16777216)
            .setTextSize(fontSize)
            .setTextGravity(android.view.Gravity.START)
            .setTextTypeface(convertFontWeightToTypeface(textStyle?.fontWeight ?: "normal"))
            .setArrowPositionRules(ArrowPositionRules.ALIGN_ANCHOR)
            .setArrowPosition(0.5f)
            .setMaxWidth(maxWidth)
            .setArrowSize(arrowSize)
            .setArrowOrientation(getArrowOrientation())
            .setPaddingBottom(pdBottom)
            .setPaddingTop(pdTop)
            .setPaddingLeft(pdLeft)
            .setPaddingRight(pdRight)
            .setCornerRadius(borderRadius)
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
            // Todo: use XML set style just like web & iOS
            //.setBalloonAnimationStyle()
            .build()

    }

    private fun openByContentView() {
        balloon = Balloon.Builder(context)
            .setLayout(layoutView!!)
            .setArrowColor(bgColor)
            .setArrowSize(arrowSize)
            .setArrowPosition(0.5f)
            .setArrowOrientation(getArrowOrientation())
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
