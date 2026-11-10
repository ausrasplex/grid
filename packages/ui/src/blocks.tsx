// Mobile-first building blocks every block page uses, so all blocks
// share the same layout rules:
//   - phones: single column, rounded cards inset from the screen edge,
//     header actions as icon buttons beside the title
//   - sm (640px+): header actions show their labels, row actions sit inline
//   - md (768px+, tablets): two-column grids where useful
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "./lib/utils";
import { Button, type ButtonProps } from "./components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/card";

/**
 * Page title with optional:
 *  - meta: a short muted line right under the title (counts, status), e.g. "12 members · 2 invited"
 *  - subtitle: a sentence describing the page
 *  - actions: kept beside the title on every screen size (use ActionButton)
 */
export function PageHeader({
  title,
  meta,
  subtitle,
  actions,
}: {
  title: string;
  meta?: ReactNode;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-4 flex items-start justify-between gap-3 sm:mb-6">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold leading-tight tracking-tight sm:text-3xl">{title}</h1>
        {meta && <p className="mt-0.5 text-xs font-medium text-muted-foreground">{meta}</p>}
        {subtitle && <p className="mt-1.5 text-sm text-muted-foreground sm:text-base">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

/**
 * A page-level action: icon-only square button on phones, icon + label
 * from sm up. The label is always the accessible name.
 */
export function ActionButton({
  icon,
  label,
  className,
  ...props
}: Omit<ButtonProps, "children" | "size"> & { icon: ReactNode; label: string }) {
  return (
    <Button aria-label={label} title={label} className={cn("size-touch px-0 sm:w-auto sm:px-4", className)} {...props}>
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </Button>
  );
}

/** Vertical rhythm between sections of a page. */
export function Stack({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("flex flex-col gap-4 sm:gap-6", className)}>{children}</div>;
}

/** One column on phones, two from tablet width. */
export function Grid({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("grid gap-4 md:grid-cols-2 sm:gap-6", className)}>{children}</div>;
}

/** A card with an optional heading. `flush` removes padding for lists that run edge to edge. */
export function Section({
  title,
  description,
  actions,
  flush = false,
  children,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  flush?: boolean;
  children: ReactNode;
}) {
  return (
    <Card>
      {(title || description || actions) && (
        <CardHeader className={cn("flex-row items-start justify-between gap-3", flush && "pb-3")}>
          <div className="min-w-0">
            {title && <CardTitle>{title}</CardTitle>}
            {description && <CardDescription className="mt-1">{description}</CardDescription>}
          </div>
          {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
        </CardHeader>
      )}
      {flush ? children : <CardContent>{children}</CardContent>}
    </Card>
  );
}

/** Divided list inside a flush Section (no top border when it's the first thing in the card). */
export function List({ children }: { children: ReactNode }) {
  return <ul className="divide-y border-t first:border-t-0">{children}</ul>;
}

/**
 * A list row. On phones the actions drop below the text and go full
 * width, so buttons are easy to hit; from sm up they sit on the right.
 */
export function ListRow({
  title,
  meta,
  badges,
  actions,
  className,
}: {
  title: ReactNode;
  meta?: ReactNode;
  badges?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <li className={cn("flex min-h-touch-lg flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5", className)}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-semibold">{title}</span>
          {badges}
        </div>
        {meta && <div className="mt-0.5 truncate text-sm text-muted-foreground">{meta}</div>}
      </div>
      {actions && <div className="flex flex-col gap-2 sm:flex-row sm:items-center [&>*]:w-full sm:[&>*]:w-auto">{actions}</div>}
    </li>
  );
}

/**
 * A compact tappable row that opens something in place (usually a bottom
 * sheet with the row's details and actions). Keeps phone lists to one
 * line per item instead of stacking buttons under every row.
 */
export function TapRow({
  leading,
  title,
  meta,
  badges,
  onClick,
  className,
}: {
  leading?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  badges?: ReactNode;
  onClick: () => void;
  className?: string;
}) {
  return (
    <li className={className}>
      <button
        type="button"
        onClick={onClick}
        className="flex min-h-touch-lg w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted active:bg-muted sm:px-5"
      >
        {leading}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate font-semibold">{title}</span>
            {badges}
          </span>
          {meta && <span className="block truncate text-sm text-muted-foreground">{meta}</span>}
        </span>
        <ChevronRight aria-hidden className="size-5 shrink-0 text-muted-foreground" />
      </button>
    </li>
  );
}

/** Round initials avatar for people lists. */
export function Avatar({ name, className }: { name: string; className?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join("");
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-accent-foreground",
        className,
      )}
    >
      {initials || "?"}
    </span>
  );
}

/** A tappable list row that navigates (settings-style), with a chevron. */
export function LinkRow({ href, icon, label, description }: { href: string; icon?: ReactNode; label: string; description?: string }) {
  return (
    <li>
      <a
        href={href}
        className="flex min-h-touch-lg items-center gap-3 px-4 py-3 transition-colors hover:bg-muted active:bg-muted sm:px-5"
      >
        {icon && <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground [&_svg]:size-5">{icon}</span>}
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{label}</span>
          {description && <span className="block truncate text-sm text-muted-foreground">{description}</span>}
        </span>
        <ChevronRight aria-hidden className="size-5 text-muted-foreground" />
      </a>
    </li>
  );
}

/** Form buttons: stacked full width on phones (primary nearest the thumb), inline from sm. */
export function FormActions({ children }: { children: ReactNode }) {
  return <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end [&>*]:w-full sm:[&>*]:w-auto">{children}</div>;
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="px-4 py-10 text-center">
      <p className="font-semibold">{title}</p>
      {children && <div className="mt-1 text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}

export function Loading({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="h-touch-lg animate-pulse rounded-xl bg-muted" />
      ))}
    </div>
  );
}
