"use client";

import * as React from "react";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "../lib/utils";

// shadcn/ui sheet. On phones a bottom drawer (thumb-reachable). From tablet
// width up (768px) it becomes, by `desktop`:
//   "drawer" (default)  slides in from the right: details, lists, pickers, longer editors
//   "dialog"            a centred box: short forms and questions ("Delete Level 3?")
// side="right" / "left" stay that side everywhere.
export const Sheet = SheetPrimitive.Root;
export const SheetTrigger = SheetPrimitive.Trigger;
export const SheetClose = SheetPrimitive.Close;

const layouts = {
  bottom: "inset-x-0 bottom-0 max-h-[85dvh] rounded-t-2xl border-t pb-safe data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom",
  right: "inset-y-0 right-0 h-full w-[85vw] max-w-md border-l pt-safe pb-safe data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right",
  left: "inset-y-0 left-0 h-full w-[85vw] max-w-md border-r pt-safe pb-safe data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left",
  dialog:
    "top-1/2 left-1/2 max-h-[85dvh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl border pb-2 data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
} as const;

const WIDE = "(min-width: 48rem)";

/** True from tablet width up. False on the server (sheets only open after a tap anyway). */
function useWide(): boolean {
  return React.useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(WIDE);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia(WIDE).matches,
    () => false,
  );
}

export function SheetContent({
  className,
  children,
  side = "bottom",
  desktop = "drawer",
  title,
  description,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: "bottom" | "right" | "left";
  /** How a bottom sheet shows from tablet width up. */
  desktop?: "drawer" | "dialog";
  title: string;
  description?: string;
}) {
  const wide = useWide();
  const layout = side === "bottom" && wide ? (desktop === "dialog" ? "dialog" : "right") : side;
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
      <SheetPrimitive.Content
        className={cn(
          "fixed z-50 flex flex-col gap-2 overflow-y-auto overscroll-contain bg-popover text-popover-foreground shadow-xl",
          "data-[state=open]:animate-in data-[state=open]:duration-300 data-[state=closed]:animate-out data-[state=closed]:duration-200",
          layout === "dialog" && "data-[state=open]:duration-200 data-[state=closed]:duration-150",
          layouts[layout],
          className,
        )}
        {...props}
      >
        {layout === "bottom" && <div aria-hidden className="mx-auto mt-2 h-1.5 w-12 shrink-0 rounded-full bg-muted" />}
        <div className={cn("flex items-center justify-between gap-2 px-4", layout === "bottom" ? "pt-2" : "pt-3")}>
          <SheetPrimitive.Title className="text-lg font-semibold">{title}</SheetPrimitive.Title>
          <SheetPrimitive.Close className="inline-flex size-touch shrink-0 items-center justify-center rounded-full hover:bg-muted" aria-label="Close">
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
