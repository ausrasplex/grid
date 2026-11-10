"use client";

import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "../lib/utils";

// Larger than shadcn's default (32x52 instead of 20x36) for thumbs and gloves.
export function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer inline-flex h-8 w-13 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors",
        "data-[state=checked]:bg-primary data-[state=unchecked]:bg-input",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "pointer-events-none block size-7 rounded-full bg-card shadow-md ring-0 transition-transform",
          "data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0",
        )}
      />
    </SwitchPrimitive.Root>
  );
}
