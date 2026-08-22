import React, { Children, type ReactNode } from "react";

/** Bounds the generic search so a deep bubble subtree is not walked in full. */
const MAX_DEPTH = 5;

/**
 * Finds the first element of the given component type.
 *
 * With `through`, the search is *structural*: it only descends through
 * fragments and the listed pass-through parts, at any depth. That is how the
 * anchored parts find each other — `Root` looks for its `Positioner` through
 * `Portal`, and for its `Popup` through both — so however many fragments or
 * conditionals sit between them, the part is still found, and the search never
 * wanders into the user's own popup content.
 *
 * Without `through`, it is a plain depth-first search capped at
 * {@link MAX_DEPTH}, for looking something up inside arbitrary children.
 *
 * Neither mode can see through a component boundary: React has not rendered
 * `<MyPositioner />` yet, so its output does not exist to be searched. Parts
 * have to be written out inside `Root`.
 */
export const findElement = (
  node: ReactNode,
  type: React.ElementType,
  through?: readonly React.ElementType[],
  depth = 0,
): React.ReactElement | undefined => {
  if (through == null && depth > MAX_DEPTH) return undefined;
  for (const child of Children.toArray(node)) {
    if (!React.isValidElement(child)) continue;
    if (child.type === type) return child;
    if (through != null) {
      const isPassThrough =
        child.type === React.Fragment || through.includes(child.type as any);
      if (!isPassThrough) continue;
    }
    const inner = (child.props as any)?.children;
    if (inner != null) {
      const found = findElement(inner, type, through, depth + 1);
      if (found) return found;
    }
  }
  return undefined;
};
