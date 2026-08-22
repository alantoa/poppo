package expo.modules.universaltooltip

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color
import android.view.MotionEvent
import android.view.View
import android.widget.FrameLayout
import com.facebook.react.bridge.ReactContext
import com.facebook.react.uimanager.JSPointerDispatcher
import com.facebook.react.uimanager.JSTouchDispatcher
import com.facebook.react.uimanager.RootView
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.uimanager.events.EventDispatcher

/**
 * Hosts the tooltip's popup slot inside Balloon's PopupWindow while keeping
 * React Native's touch pipeline alive. The popup window lives outside the
 * React root view, so touches would never reach JS on their own — this
 * container re-dispatches motion events to React the same way React Native's
 * own Modal (DialogRootViewGroup) does.
 *
 * The slot is much wider than the bubble on purpose (see `popupSlotStyle` on
 * the JS side): it is a measuring box, and the bubble is the view inside it.
 * So this host never measures or lays out its child — React owns both — it
 * only reports the bubble's size and shifts the slot so the bubble lands on
 * the host's origin.
 */
@SuppressLint("ViewConstructor")
class TooltipRootViewGroup(
    context: Context,
    private val reactContext: ReactContext?,
) : FrameLayout(context), RootView {
    private val jsTouchDispatcher = JSTouchDispatcher(this)
    private val jsPointerDispatcher = JSPointerDispatcher(this)

    private var bubbleWidth = 0
    private var bubbleHeight = 0
    private var bubbleLeft = 0
    private var bubbleTop = 0

    init {
        clipChildren = false
        clipToPadding = false
        clipToOutline = false
        setBackgroundColor(Color.TRANSPARENT)
    }

    /** Size of the React view that actually paints the bubble. */
    fun setBubbleFrame(left: Int, top: Int, width: Int, height: Int) {
        if (bubbleLeft == left && bubbleTop == top &&
            bubbleWidth == width && bubbleHeight == height
        ) {
            return
        }
        bubbleLeft = left
        bubbleTop = top
        bubbleWidth = width
        bubbleHeight = height
        layoutParams = layoutParams?.also {
            it.width = width
            it.height = height
        } ?: LayoutParams(width, height)
        requestLayout()
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        if (bubbleWidth > 0 && bubbleHeight > 0) {
            setMeasuredDimension(bubbleWidth, bubbleHeight)
            return
        }
        super.onMeasure(widthMeasureSpec, heightMeasureSpec)
    }

    override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
        // React lays out the slot and everything inside it. Only shift it so
        // the bubble sits on this host's origin.
        val slot = getChildAt(0) ?: return
        val x = -bubbleLeft
        val y = -bubbleTop
        slot.layout(x, y, x + slot.width, y + slot.height)
    }

    private val eventDispatcher: EventDispatcher?
        get() = reactContext?.let { UIManagerHelper.getEventDispatcher(it) }

    override fun onInterceptTouchEvent(event: MotionEvent): Boolean {
        eventDispatcher?.let {
            jsTouchDispatcher.handleTouchEvent(event, it)
            jsPointerDispatcher.handleMotionEvent(event, it, true)
        }
        return super.onInterceptTouchEvent(event)
    }

    @SuppressLint("ClickableViewAccessibility")
    override fun onTouchEvent(event: MotionEvent): Boolean {
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
        eventDispatcher?.let { jsPointerDispatcher.handleMotionEvent(event, it, true) }
        return super.onInterceptHoverEvent(event)
    }

    override fun onHoverEvent(event: MotionEvent): Boolean {
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
