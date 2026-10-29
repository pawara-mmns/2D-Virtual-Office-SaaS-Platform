import type { HTMLAttributes, ReactNode } from "react";

export type GlassVariant = "clear" | "regular" | "elevated";

// A material boundary, not a feature/state owner. Native semantics and existing
// layout classes remain intact; descendants do not get independent filters.
export function GlassSurface({ as: Tag = "div", variant = "regular", className = "", children, ...props }: {
  as?: "div" | "nav" | "header" | "section"; variant?: GlassVariant; children: ReactNode;
} & HTMLAttributes<HTMLElement>) {
  return <Tag {...props} className={`glass-surface ${className}`} data-glass-surface="" data-glass-variant={variant}>{children}</Tag>;
}
