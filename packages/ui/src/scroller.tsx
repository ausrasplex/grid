"use client";

// Scroll affordance for phones and tablets, where scrollbars are hidden
// (docs/visual-style.md). An element that can scroll further gets a
// data-scroll attribute ("down", "left", "right"), which styles.css turns
// into a fade at that edge. The fade disappears when you reach the end.

import { useCallback, useEffect, useRef, type HTMLAttributes, type RefObject } from "react";
import { cn } from "./lib/utils";

type Axis = "y" | "x";

const EDGE = 4; // px of slack so sub-pixel layouts don't flicker

export function useOverflow<T extends HTMLElement>(axis: Axis = "y"): RefObject<T | null> {
  const ref = useRef<T | null>(null);

  const update = useCallback(() => {
    const element = ref.current;
    if (!element) return;
    const flags: string[] = [];
    if (axis === "y") {
      if (element.scrollHeight - element.clientHeight - element.scrollTop > EDGE) flags.push("down");
    } else {
      // scrollLeft is negative in right-to-left containers; use its size.
      const left = Math.abs(element.scrollLeft);
      if (left > EDGE) flags.push("left");
      if (element.scrollWidth - element.clientWidth - left > EDGE) flags.push("right");
    }
    if (flags.length) element.setAttribute("data-scroll", flags.join(" "));
    else element.removeAttribute("data-scroll");
  }, [axis]);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    update();
    element.addEventListener("scroll", update, { passive: true });
    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(element);
    // Content changes (lists loading) change the scroll size too.
    const mutationObserver = new MutationObserver(update);
    mutationObserver.observe(element, { childList: true, subtree: true });
    return () => {
      element.removeEventListener("scroll", update);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [update]);

  return ref;
}

/**
 * A scrollable area with the edge fade built in.
 *   <Scroller className="max-h-80">…long list…</Scroller>
 *   <Scroller axis="x" className="flex gap-2">…chips…</Scroller>
 */
export function Scroller({ axis = "y", className, ...props }: HTMLAttributes<HTMLDivElement> & { axis?: Axis }) {
  const ref = useOverflow<HTMLDivElement>(axis);
  return (
    <div
      ref={ref}
      className={cn(axis === "y" ? "overflow-y-auto overscroll-contain" : "overflow-x-auto", className)}
      {...props}
    />
  );
}
