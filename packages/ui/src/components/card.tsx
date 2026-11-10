import * as React from "react";
import { cn } from "../lib/utils";

// Rounded card that sits inside the page padding, so a strip of
// background shows between it and the screen edge on every device.
// Concept C: no outline or shadow; the surface colour and spacing separate
// it from the page. overflow-hidden keeps row highlights inside the corners.
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="card"
      className={cn("overflow-hidden rounded-xl bg-card text-card-foreground", className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="card-header" className={cn("flex flex-col gap-1 px-4 pt-4 sm:px-5", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 data-slot="card-title" className={cn("text-lg font-semibold leading-tight", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p data-slot="card-description" className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="card-content" className={cn("px-4 py-4 sm:px-5", className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex flex-col-reverse gap-2 border-t px-4 py-3 sm:flex-row sm:justify-end sm:px-5", className)}
      {...props}
    />
  );
}
