import React, { Children, type ReactNode } from "react";

/**
 * Depth-first search for the first element of the given component type,
 * descending through fragments and pass-through wrappers (Portal, Positioner).
 */
export const findElement = (
  node: ReactNode,
  type: React.ElementType,
  depth = 0,
): React.ReactElement | undefined => {
  if (depth > 5) return undefined;
  for (const child of Children.toArray(node)) {
    if (!React.isValidElement(child)) continue;
    if (child.type === type) return child;
    const inner = (child.props as any)?.children;
    if (inner != null) {
      const found = findElement(inner, type, depth + 1);
      if (found) return found;
    }
  }
  return undefined;
};
