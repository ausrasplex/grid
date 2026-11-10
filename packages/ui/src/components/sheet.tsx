"use client";

import * as React from "react";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "../lib/utils";

// shadcn/ui sheet. On phones use side="bottom": a thumb-reachable drawer.
export const Sheet = SheetPrimitive.Root;
export const SheetTrigger = SheetPrimitive.Trigger;
export const SheetClose = SheetPrimitive.Close;

const sides = {
  bottom: "inset-x-0 bottom-0 max-h-[85dvh] rounded-t-2xl border-t pb-safe data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom",
  right: "inset-y-0 right-0 h-full w-[85vw] max-w-sm border-l pt-safe pb-safe data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right",
  left: "inset-y-0 left-0 h-full w-[85vw] max-w-sm border-r pt-safe pb-safe data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left",
} as const;

export function SheetContent({
  className,
  children,
  side = "bottom",
  title,
  description,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & { side?: keyof typeof sides; title: string; description?: string }) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
      <SheetPrimitive.Content
        className={cn(
          "fixed z-50 flex flex-col gap-2 overflow-y-auto bg-popover text-popover-foreground shadow-xl",
          "data-[state=open]:animate-in data-[state=open]:duration-300 data-[state=closed]:animate-out data-[state=closed]:duration-200",
          sides[side],
          className,
        )}
        {...props}
      >
        {side === "bottom" && <div aria-hidden className="mx-auto mt-2 h-1.5 w-12 shrink-0 rounded-full bg-muted" />}
        <div className="flex items-center justify-between gap-2 px-4 pt-2">
          <SheetPrimitive.Title className="text-lg font-semibold">{title}</SheetPrimitive.Title>
          <SheetPrimitive.Close className="inline-flex size-touch items-center justify-center rounded-full hover:bg-muted" aria-label="Close">
            <X className="size-5" />
          </SheetPrimitive.Close>
        </div>
        {description ? (
          <SheetPrimitive.Description className="px-4 text-sm text-muted-foreground">{description}</SheetPrimitive.Description>
        ) : (
          <SheetPrimitive.Description className="sr-only">{title}</SheetPrimitive.Description>
        )}
        <div className="px-2 pb-4">{children}</div>
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}
