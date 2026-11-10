import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "../lib/utils";

// A styled native <select>. On phones and tablets the native picker is
// faster and more reliable than a custom dropdown, so we use it everywhere.
export function NativeSelect({
  className,
  options,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[] }) {
  return (
    <div className="relative w-full">
      <select
        data-slot="select"
        className={cn(
          "h-touch w-full appearance-none rounded-md border border-input bg-card pl-3 pr-10 text-base shadow-xs",
          "focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
          "disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70",
          className,
        )}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}
