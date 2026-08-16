import { createAnchoredSet } from "./primitives/create-anchored";

/**
 * Popover — an anchored popup opened on click/press, suited for interactive
 * content. Parts: Root, Trigger, Portal, Positioner, Popup, Arrow.
 */
export const Popover = createAnchoredSet("popover");
