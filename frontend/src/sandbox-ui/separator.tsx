import * as React from "react";
import { cn } from "../lib/utils";

const Separator = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    orientation?: "horizontal" | "vertical";
  }
>(({ className, orientation = "horizontal", ...props }, ref) => (
  <div
    ref={ref}
    role="separator"
    aria-orientation={orientation}
    className={cn(
      "shrink-0 bg-border",
      orientation === "horizontal" ? "h-[0.5px] w-full my-4" : "h-full w-[0.5px]",
      className,
    )}
    {...props}
  />
));
Separator.displayName = "Separator";

export { Separator };
