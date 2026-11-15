// Pieces Blocks put on Home in the Soft look (docs/visual-style.md "Themes").
//   panel slot "home.tiles"      <HomeTile>: one numbered tile in the hero card
//   panel slot "home.attention"  <AttentionRow>s: the "Needs attention" list
// Home numbers and colours the tiles itself; a Block only says what's in one.

import type { ReactNode } from "react";
import { Icon } from "./icons";
import { cn } from "./lib/utils";

export function HomeTile({
  label,
  value,
  foot,
  progress,
  badge,
  href,
}: {
  label: string;
  value: string;
  foot?: string;
  /** 0–1: a bar under the foot line (e.g. share of tickets current). */
  progress?: number;
  badge?: string;
  href?: string;
}) {
  const body = (
    <>
      <span className="flex items-center gap-2 text-sm font-medium">
        {label}
        {badge && <span className="rounded-full bg-black/10 px-2 py-0.5 text-[11px] font-semibold">{badge}</span>}
      </span>
      <span className="mt-1 block text-3xl font-bold tracking-tight tabular-nums">{value}</span>
      <span className="flex-1" />
      {foot && <span className="mt-6 block text-xs opacity-80">{foot}</span>}
      <span className="mt-2 block h-1 overflow-hidden rounded-full bg-black/15">
        <span className="block h-full rounded-full bg-current" style={{ width: `${Math.round(Math.max(0, Math.min(1, progress ?? 1)) * 100)}%` }} />
      </span>
    </>
  );
  return href ? (
    <a href={href} className="flex h-full flex-col hover:opacity-90">
      {body}
    </a>
  ) : (
    <div className="flex h-full flex-col">{body}</div>
  );
}

export function AttentionRow({
  title,
  description,
  badge,
  tone = "default",
  href,
}: {
  title: string;
  description?: string;
  badge?: string;
  tone?: "default" | "warning" | "destructive";
  href: string;
}) {
  return (
    <li>
      <a href={href} className="flex min-h-touch-lg items-center gap-3 px-4 py-3 hover:bg-muted active:bg-muted sm:px-6">
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{title}</span>
            {badge && (
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-semibold",
                  tone === "destructive" ? "bg-destructive/15 text-destructive" : tone === "warning" ? "bg-warning/20 text-foreground" : "bg-muted text-foreground",
                )}
              >
                {badge}
              </span>
            )}
          </span>
          {description && <span className="mt-0.5 block text-sm text-muted-foreground">{description}</span>}
        </span>
        <Icon name="chevron-right" className="size-5 shrink-0 text-muted-foreground" />
      </a>
    </li>
  );
}

/** The "Needs attention" card around AttentionRows. */
export function AttentionList({ children, subtitle }: { children: ReactNode; subtitle?: string }) {
  return (
    <section className="overflow-hidden rounded-[24px] bg-card">
      <div className="px-4 pt-5 pb-2 sm:px-6">
        <h2 className="text-xl font-semibold tracking-tight">Needs attention</h2>
        {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      <ul className="divide-y pb-2">{children}</ul>
    </section>
  );
}
