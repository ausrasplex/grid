"use client";

import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "../lib/utils";

// Grid's drop-down: the box and the list that opens both use the theme
// (card colour, rounded corners, yellow focus, big touch rows) instead of
// the browser's own list. Decided Nov 2026 (docs/visual-style.md).
//
// It keeps the shape of a native <select> so callers didn't change:
// value, onChange(event) with event.target.value, options, disabled,
// required, name, id, aria-*. (Built on Radix Select, which handles the
// keyboard, typing to jump and screen readers, and still posts in forms.)

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  /** Options next to each other with the same group get a heading above them. */
  group?: string;
}

/** What onChange receives: enough of a change event for `event.target.value`. */
export interface SelectChange {
  target: { value: string; name?: string };
  currentTarget: { value: string; name?: string };
}

export interface NativeSelectProps {
  options: SelectOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (event: SelectChange) => void;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  id?: string;
  placeholder?: string;
  className?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
}

// Radix doesn't allow "" as an item value; "" options ("Everyone", "Whole building") use this instead.
// A value of "" with no "" option means nothing is chosen yet: the placeholder shows.
const EMPTY = "__grid_empty__";
const fromRadix = (value: string) => (value === EMPTY ? "" : value);

export function NativeSelect({
  options,
  value,
  defaultValue,
  onChange,
  disabled,
  required,
  name,
  id,
  placeholder,
  className,
  "aria-label": ariaLabel,
  "aria-describedby": describedBy,
  "aria-invalid": invalid,
}: NativeSelectProps) {
  const hasEmpty = options.some((option) => option.value === "");
  const toRadix = (current: string | undefined) => (current === "" && hasEmpty ? EMPTY : current);
  return (
    <SelectPrimitive.Root
      value={toRadix(value)}
      defaultValue={toRadix(defaultValue)}
      onValueChange={(next) => {
        const chosen = fromRadix(next);
        onChange?.({ target: { value: chosen, name }, currentTarget: { value: chosen, name } });
      }}
      disabled={disabled}
      required={required}
      name={name}
    >
      <SelectPrimitive.Trigger
        id={id}
        data-slot="select"
        aria-label={ariaLabel}
        aria-describedby={describedBy}
        aria-invalid={invalid}
        className={cn(
          "flex h-touch w-full items-center justify-between gap-2 rounded-md border border-input bg-card pr-3 pl-3 text-left text-base shadow-xs",
          "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none",
          "data-[state=open]:border-ring data-[placeholder]:text-muted-foreground",
          "disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70",
          className,
        )}
      >
        <span className="min-w-0 truncate">
          <SelectPrimitive.Value placeholder={placeholder ?? "Choose…"} />
        </span>
        <SelectPrimitive.Icon asChild>
          <ChevronDown aria-hidden className="size-5 shrink-0 text-muted-foreground" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          collisionPadding={8}
          className={cn(
            "relative z-[60] max-h-[min(24rem,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] overflow-hidden",
            "rounded-xl border bg-popover text-popover-foreground shadow-xl",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
          )}
        >
          <SelectPrimitive.ScrollUpButton className="flex h-7 items-center justify-center text-muted-foreground">
            <ChevronUp className="size-4" />
          </SelectPrimitive.ScrollUpButton>
          <SelectPrimitive.Viewport className="p-1.5">
            {options.map((option, index) => (
              <React.Fragment key={option.value}>
              {option.group && option.group !== options[index - 1]?.group && (
                <div className={cn("px-3 pt-3 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase", index > 0 && "mt-1 border-t")}>{option.group}</div>
              )}
              <SelectPrimitive.Item
                value={option.value === "" ? EMPTY : option.value}
                disabled={option.disabled}
                className={cn(
                  "relative flex min-h-touch cursor-default items-center gap-2 rounded-lg py-2 pr-9 pl-3 text-base outline-none select-none",
                  "data-[highlighted]:bg-muted data-[state=checked]:font-semibold data-[disabled]:opacity-50",
                )}
              >
                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator className="absolute right-3 inline-flex items-center text-primary">
                  <Check className="size-5" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
              </React.Fragment>
            ))}
          </SelectPrimitive.Viewport>
          <SelectPrimitive.ScrollDownButton className="flex h-7 items-center justify-center text-muted-foreground">
            <ChevronDown className="size-4" />
          </SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
