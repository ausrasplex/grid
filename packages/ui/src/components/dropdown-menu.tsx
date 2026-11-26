"use client";

// shadcn/ui dropdown menu, for the ⋯ menu beside a page title or a row
// (Edit, Duplicate, Archive…) and for a button with a few ways to do one
// thing ("Checked ▾": today, earlier, book it in). Items are 44px tall for
// thumbs; destructive ones sit last, after a separator.
import * as React from "react";
import * as MenuPrimitive from "@radix-ui/react-dropdown-menu";
import { cn } from "../lib/utils";

export const DropdownMenu = MenuPrimitive.Root;
export const DropdownMenuTrigger = MenuPrimitive.Trigger;

export function DropdownMenuContent({ className, align = "end", sideOffset = 4, ...props }: React.ComponentProps<typeof MenuPrimitive.Content>) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "z-50 max-h-(--radix-dropdown-menu-content-available-height) min-w-48 overflow-y-auto rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-xl",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          className,
        )}
        {...props}
      />
    </MenuPrimitive.Portal>
  );
}

export function DropdownMenuItem({ className, variant = "default", ...props }: React.ComponentProps<typeof MenuPrimitive.Item> & { variant?: "default" | "destructive" }) {
  return (
    <MenuPrimitive.Item
      data-variant={variant}
      className={cn(
        "relative flex min-h-touch cursor-default items-center gap-2.5 rounded-md px-3 text-sm font-semibold outline-hidden select-none",
        "focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        "data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:focus:text-destructive",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({ className, ...props }: React.ComponentProps<typeof MenuPrimitive.Separator>) {
  return <MenuPrimitive.Separator className={cn("-mx-1.5 my-1.5 h-px bg-border", className)} {...props} />;
}

/** A menu item with a second line explaining it ("Log it with today's date"). */
export function DropdownMenuDetail({ title, detail }: { title: string; detail: string }) {
  return (
    <span className="flex flex-col py-1.5">
      {title}
      <span className="text-xs font-medium text-muted-foreground">{detail}</span>
    </span>
  );
}
