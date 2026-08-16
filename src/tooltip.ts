import { createAnchoredSet } from "./primitives/create-anchored";

/**
 * Tooltip — an anchored popup opened on hover (web) or press (native).
 * Parts: Root, Trigger, Portal, Positioner, Popup, Arrow.
 */
export const Tooltip = createAnchoredSet("tooltip");
