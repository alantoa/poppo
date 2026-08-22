package expo.modules.universaltooltip

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.view.MotionEvent
import android.view.View
import android.widget.FrameLayout
import com.facebook.react.bridge.ReactContext
import com.facebook.react.uimanager.JSPointerDispatcher
import com.facebook.react.uimanager.JSTouchDispatcher
import com.facebook.react.uimanager.RootView
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.uimanager.events.EventDispatcher
import expo.modules.universaltooltip.enums.ContentSide

/**
 * The whole popup: bubble body plus arrow, hosted inside Balloon's
 * PopupWindow. Balloon only positions this view — its own arrow is disabled,
 * because it is always square and would ignore the `height` an `<Arrow>`
 * asks for.
 *
 * The arrow lives in the padding this view reserves on the side facing the
 * trigger, so the bubble body and the triangle are laid out as one box and
 * Balloon's placement already accounts for the arrow.
 *
 * When the body is React content the popup window sits outside the React root
 * view, so touches would never reach JS on their own; this container
 * re-dispatches them the same way React Native's own Modal does.
 */
@SuppressLint("ViewConstructor")
class TooltipRootViewGroup(
    context: Context,
    private val reactContext: ReactContext?,
) : FrameLayout(context), RootView {
    private val jsTouchDispatcher = JSTouchDispatcher(this)
    private val jsPointerDispatcher = JSPointerDispatcher(this)

    /** React content needs the touch bridge; a native text bubble does not. */
    var dispatchesToReact = false

    private var side: ContentSide = ContentSide.Top
    private var arrowWidth = 0
    private var arrowHeight = 0
    private var cornerRadius = 0f
    private var arrowCenter = Int.MIN_VALUE

    /** Set for React content, whose size React owns. Zero means "measure me". */
    private var bubbleWidth = 0
    private var bubbleHeight = 0
    private var bubbleLeft = 0
    private var bubbleTop = 0

    private val arrowPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val arrowPath = Path()

    init {
        clipChildren = false
        clipToPadding = false
        clipToOutline = false
        setWillNotDraw(false)
        setBackgroundColor(Color.TRANSPARENT)
    }

    fun setArrow(
        side: ContentSide,
        widthPx: Int,
        heightPx: Int,
        color: Int,
        cornerRadiusPx: Float,
    ) {
        this.side = side
        arrowWidth = widthPx.coerceAtLeast(0)
        arrowHeight = heightPx.coerceAtLeast(0)
        cornerRadius = cornerRadiusPx
        arrowPaint.color = color
        // The arrow grows out of the side that faces the trigger.
        setPadding(
            if (side == ContentSide.Right) arrowHeight else 0,
            if (side == ContentSide.Bottom) arrowHeight else 0,
            if (side == ContentSide.Left) arrowHeight else 0,
            if (side == ContentSide.Top) arrowHeight else 0,
        )
        requestLayout()
        invalidate()
    }

    /** Frame of the React view that paints the bubble, inside the popup slot. */
    fun setBubbleFrame(left: Int, top: Int, width: Int, height: Int) {
        bubbleLeft = left
        bubbleTop = top
        bubbleWidth = width
        bubbleHeight = height
        requestLayout()
    }

    /**
     * Where the arrow points, measured along the facing edge from this view's
     * origin. Balloon centres the popup on the trigger but slides it inward at
     * a screen edge, so this is only known once the window is up.
     */
    fun setArrowCenter(centerPx: Int) {
        if (arrowCenter == centerPx) return
        arrowCenter = centerPx
        invalidate()
    }

    private val isHorizontal: Boolean
        get() = side == ContentSide.Left || side == ContentSide.Right

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        if (bubbleWidth > 0 && bubbleHeight > 0) {
            setMeasuredDimension(
                bubbleWidth + paddingLeft + paddingRight,
                bubbleHeight + paddingTop + paddingBottom,
            )
            return
        }
        super.onMeasure(widthMeasureSpec, heightMeasureSpec)
    }

    override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
        if (bubbleWidth <= 0 || bubbleHeight <= 0) {
            // Native text bubble: an ordinary child, laid out inside the padding.
            super.onLayout(changed, left, top, right, bottom)
            return
        }
        // React lays out the slot and everything inside it. Only shift it so
        // the bubble it holds lands on the content box's origin.
        val slot = getChildAt(0) ?: return
        val x = paddingLeft - bubbleLeft
        val y = paddingTop - bubbleTop
        slot.layout(x, y, x + slot.width, y + slot.height)
    }

    override fun dispatchDraw(canvas: Canvas) {
        super.dispatchDraw(canvas)
        drawArrow(canvas)
    }

    private fun drawArrow(canvas: Canvas) {
        if (arrowWidth <= 0 || arrowHeight <= 0) return
        val contentLeft = paddingLeft.toFloat()
        val contentTop = paddingTop.toFloat()
        val contentRight = (width - paddingRight).toFloat()
        val contentBottom = (height - paddingBottom).toFloat()
        if (contentRight <= contentLeft || contentBottom <= contentTop) return

        val half = arrowWidth / 2f
        // Keep the triangle clear of the body's rounded corners.
        val inset = cornerRadius + half
        val lower = (if (isHorizontal) contentTop else contentLeft) + inset
        val upper = (if (isHorizontal) contentBottom else contentRight) - inset
        val requested = if (arrowCenter != Int.MIN_VALUE) {
            arrowCenter.toFloat()
        } else if (isHorizontal) {
            (contentTop + contentBottom) / 2f
        } else {
            (contentLeft + contentRight) / 2f
        }
        val mid = if (upper < lower) (lower + upper) / 2f else requested.coerceIn(lower, upper)

        // Sink the base into the body so the seam between the two cannot show.
        val overlap = 1f
        arrowPath.reset()
        when (side) {
            ContentSide.Bottom -> {
                val base = contentTop + overlap
                arrowPath.moveTo(mid - half, base)
                arrowPath.lineTo(mid, contentTop - arrowHeight)
                arrowPath.lineTo(mid + half, base)
            }
            ContentSide.Left -> {
                val base = contentRight - overlap
                arrowPath.moveTo(base, mid - half)
                arrowPath.lineTo(contentRight + arrowHeight, mid)
                arrowPath.lineTo(base, mid + half)
            }
            ContentSide.Right -> {
                val base = contentLeft + overlap
                arrowPath.moveTo(base, mid - half)
                arrowPath.lineTo(contentLeft - arrowHeight, mid)
                arrowPath.lineTo(base, mid + half)
            }
            else -> {
                val base = contentBottom - overlap
                arrowPath.moveTo(mid - half, base)
                arrowPath.lineTo(mid, contentBottom + arrowHeight)
                arrowPath.lineTo(mid + half, base)
            }
        }
        arrowPath.close()
        canvas.drawPath(arrowPath, arrowPaint)
    }

    private val eventDispatcher: EventDispatcher?
        get() = reactContext?.let { UIManagerHelper.getEventDispatcher(it) }

    override fun onInterceptTouchEvent(event: MotionEvent): Boolean {
        if (!dispatchesToReact) return super.onInterceptTouchEvent(event)
        eventDispatcher?.let {
            jsTouchDispatcher.handleTouchEvent(event, it)
            jsPointerDispatcher.handleMotionEvent(event, it, true)
        }
        return super.onInterceptTouchEvent(event)
    }

    @SuppressLint("ClickableViewAccessibility")
    override fun onTouchEvent(event: MotionEvent): Boolean {
        // A native text bubble has no React children, so leave the event alone
        // and let Balloon's own click listener drive tap-to-dismiss.
        if (!dispatchesToReact) return super.onTouchEvent(event)
        eventDispatcher?.let {
            jsTouchDispatcher.handleTouchEvent(event, it)
            jsPointerDispatcher.handleMotionEvent(event, it, false)
        }
        super.onTouchEvent(event)
        // Return true so this root keeps receiving the rest of the gesture
        // even when no child claims the initial down event.
        return true
    }

    override fun onInterceptHoverEvent(event: MotionEvent): Boolean {
        if (!dispatchesToReact) return super.onInterceptHoverEvent(event)
        eventDispatcher?.let { jsPointerDispatcher.handleMotionEvent(event, it, true) }
        return super.onInterceptHoverEvent(event)
    }

    override fun onHoverEvent(event: MotionEvent): Boolean {
        if (!dispatchesToReact) return super.onHoverEvent(event)
        eventDispatcher?.let { jsPointerDispatcher.handleMotionEvent(event, it, false) }
        return super.onHoverEvent(event)
    }

    override fun onChildStartedNativeGesture(childView: View?, ev: MotionEvent) {
        eventDispatcher?.let {
            jsTouchDispatcher.onChildStartedNativeGesture(ev, it)
            if (childView != null) {
                jsPointerDispatcher.onChildStartedNativeGesture(childView, ev, it)
            }
        }
    }

    override fun onChildEndedNativeGesture(childView: View, ev: MotionEvent) {
        eventDispatcher?.let { jsTouchDispatcher.onChildEndedNativeGesture(ev, it) }
        jsPointerDispatcher.onChildEndedNativeGesture()
    }

    override fun requestDisallowInterceptTouchEvent(disallowIntercept: Boolean) {
        // No-op: children like ScrollView may call this, but the popup root
        // must keep dispatching events to JS (same behavior as RN's Modal).
    }

    override fun handleException(t: Throwable) {
        reactContext?.handleException(RuntimeException(t))
    }
}
