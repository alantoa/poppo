/**
 * Marks the popup slot — an absolutely positioned, window-wide measuring box
 * that native code moves into the popup window. Native finds it by id, never
 * by child index, because Fabric may mount the trigger first.
 */
export const POPUP_CONTENT_NATIVE_ID = "universal-tooltip-content";

/**
 * Marks the bubble itself inside the slot. It hugs its content, so its frame
 * is the exact size native has to position, size and point the arrow at.
 */
export const POPUP_BODY_NATIVE_ID = "universal-tooltip-body";
