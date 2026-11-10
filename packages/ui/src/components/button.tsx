import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/utils";

// shadcn/ui button, sized for touch: default height is 44px, "lg" 52px.
export const buttonVariants = cva(
  "inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-md text-base font-semibold transition-colors active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-5 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline: "border border-input bg-card hover:bg-muted",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-muted",
        link: "h-auto px-0 text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-touch px-4",
        sm: "h-10 px-3 text-sm",
        lg: "h-touch-lg px-6 text-lg",
        icon: "size-touch",
      },
      block: {
        // Full width on phones, natural width from sm up.
        true: "w-full sm:w-auto",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, size, block, asChild = false, ...props }: ButtonProps) {
  const Component = asChild ? Slot : "button";
  return <Component data-slot="button" className={cn(buttonVariants({ variant, size, block }), className)} {...props} />;
}
