"use client";

// Small shared controls: segmented tabs and a search box.
import { Search } from "lucide-react";
import type { InputHTMLAttributes } from "react";
import { cn } from "./lib/utils";
import { Input } from "./components/input";

/** Tabs as one pill row (Active · Mine · Archived). Scrolls sideways if it must. */
export function Segmented<T extends string>({
  items,
  value,
  onChange,
  label,
  className,
}: {
  items: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="tablist" aria-label={label} className={cn("flex w-full gap-1 overflow-x-auto rounded-lg bg-muted p-1 sm:w-auto", className)}>
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          role="tab"
          aria-selected={item.value === value}
          onClick={() => onChange(item.value)}
          className={cn(
            "flex h-10 flex-1 items-center justify-center gap-1.5 rounded-md px-4 text-sm font-semibold whitespace-nowrap transition-colors sm:flex-none",
            item.value === value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {item.label}
          {item.count !== undefined && <span className="text-xs text-muted-foreground">{item.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** A search box with a magnifier. Pass a label for screen readers. */
export function SearchInput({ label, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <div className={cn("relative", className)}>
      <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" />
      <Input type="search" aria-label={label} enterKeyHint="search" autoComplete="off" className="pl-10" {...props} />
    </div>
  );
}

/** "1.4 MB", "820 KB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[unitIndex]}`;
}

/** "in 12 days", "tomorrow", "at the next clean-up". */
export function whenRemoved(at: string | Date): string {
  const days = Math.ceil((new Date(at).getTime() - Date.now()) / 86_400_000);
  if (days <= 0) return "at the next clean-up";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

/** A tick box row: thumbnail or icon, two lines of text, selectable. */
export function SelectRow({
  checked,
  onChange,
  media,
  title,
  meta,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  media: React.ReactNode;
  title: React.ReactNode;
  meta: React.ReactNode;
}) {
  return (
    <li>
      <label className={cn("flex min-h-touch-lg cursor-pointer items-center gap-3 px-4 py-2 hover:bg-muted sm:px-5", checked && "bg-accent/40")}>
        <input type="checkbox" className="size-5 shrink-0 accent-[var(--color-primary)]" checked={checked} onChange={(event) => onChange(event.target.checked)} />
        <span className="size-14 shrink-0 overflow-hidden rounded-md bg-muted">{media}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{title}</span>
          <span className="block text-sm text-muted-foreground">{meta}</span>
        </span>
      </label>
    </li>
  );
}
