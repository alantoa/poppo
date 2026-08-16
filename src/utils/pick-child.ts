import React, { type ReactNode } from "react";

export const pickChild = (
  children: ReactNode | undefined,
  targetChild: React.ElementType,
): [ReactNode | undefined, ReactNode | undefined] => {
  const target: ReactNode[] = [];
  const withoutTargetChildren = React.Children.map(children, (item) => {
    if (!React.isValidElement(item)) return item;
    if (item.type === targetChild) {
      target.push(item);
      return null;
    }
    return item;
  });

  const targetChildren = target.length >= 0 ? target : undefined;

  return [withoutTargetChildren, targetChildren];
};
