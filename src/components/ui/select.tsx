import * as React from "react";

import { cn } from "@/lib/utils";

/** Styled native <select> — consistent height/border/focus with Input/Textarea. */
const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      "flex h-11 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 sm:h-9",
      className,
    )}
    {...props}
  />
));
Select.displayName = "Select";

export { Select };
