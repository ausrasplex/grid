import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/utils";

export const badgeVariants = cva(
  "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        outline: "text-muted-foreground",
        success: "border-success/40 bg-success/10 text-success",
        warning: "border-warning/50 bg-warning/15 text-foreground",
        destructive: "border-destructive/40 bg-destructive/10 text-destructive",
      },
    },
    defaultVariants: { variant: "outline" },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}
