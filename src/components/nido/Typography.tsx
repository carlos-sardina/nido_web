import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/app/components/ui/utils";

type HeadingSize = "display" | "h1" | "h2" | "h3";
type HeadingTag = "h1" | "h2" | "h3" | "p";

export function Heading({
  as,
  size = "h1",
  family = "display",
  className,
  children,
  ...props
}: HTMLAttributes<HTMLHeadingElement> & {
  as?: HeadingTag;
  size?: HeadingSize;
  family?: "display" | "ui";
  children: ReactNode;
}) {
  const Tag = as ?? (size === "display" || size === "h1" ? "h1" : size === "h2" ? "h2" : "h3");

  return (
    <Tag
      className={cn(
        "text-pretty text-foreground font-bold",
        family === "display" ? "font-display" : "font-sans",
        size === "display" && "text-display",
        size === "h1" && "text-h1",
        size === "h2" && "text-h2",
        size === "h3" && "text-h3",
        className,
      )}
      {...props}
    >
      {children}
    </Tag>
  );
}

type TextSize = "body" | "body-sm" | "label" | "caption";
type TextTone = "default" | "muted" | "danger" | "brand";

export function Text({
  as: Tag = "p",
  size = "body",
  tone = "default",
  className,
  children,
  ...props
}: HTMLAttributes<HTMLElement> & {
  as?: "p" | "span" | "label";
  size?: TextSize;
  tone?: TextTone;
  children: ReactNode;
}) {
  return (
    <Tag
      className={cn(
        "font-sans",
        size === "body" && "text-body",
        size === "body-sm" && "text-body-sm",
        size === "label" && "text-label font-semibold",
        size === "caption" && "text-caption",
        tone === "default" && "text-foreground",
        tone === "muted" && "text-muted-foreground",
        tone === "danger" && "text-danger",
        tone === "brand" && "text-primary",
        className,
      )}
      {...props}
    >
      {children}
    </Tag>
  );
}
