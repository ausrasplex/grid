import * as React from "react";
import { cn } from "../lib/utils";

// text-base (16px) on purpose: smaller fonts make iOS zoom the page on focus.
export function Input({ className, type = "text", ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-touch w-full min-w-0 rounded-md border border-input bg-card px-3 text-base shadow-xs transition-colors",
        "placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70",
        "focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        "aria-invalid:border-destructive",
        className,
      )}
      {...props}
    />
  );
}
