// A short breadcrumb trail above a page title: "Sites › Riverside › Buildings
// & levels", "Settings › Clients". Every crumb but the last is a link; the
// first can have an icon. (The site/building/level trail with pickers is
// LocationBar, in the jobs Block.)

import type { ReactNode } from "react";
import { Icon } from "./icons";

export interface Crumb {
  label: string;
  /** Leave out for the page you're on (the last crumb). */
  href?: string;
  /** Icon name from the app's icon set, for the first crumb. */
  icon?: string;
}

export function Crumbs({ items, className }: { items: Crumb[]; className?: string }): ReactNode {
  return (
    <nav aria-label="Breadcrumb" className={className ?? "-mt-2 mb-2 sm:mb-3"}>
      <ol className="flex min-w-0 items-center gap-1 text-sm">
        {items.map((item, index) => (
          <li key={`${index}-${item.label}`} className={index === items.length - 1 ? "flex min-w-0 items-center gap-1" : "flex shrink-0 items-center gap-1"}>
            {index > 0 && <Icon name="chevron-right" className="size-4 shrink-0 text-muted-foreground" />}
            {item.href ? (
              <a
                href={item.href}
                className={`${index === 0 ? "-ml-2 " : ""}inline-flex min-h-touch max-w-[12rem] items-center gap-1.5 rounded-md px-2 text-muted-foreground hover:bg-muted hover:text-foreground`}
              >
                {item.icon && <Icon name={item.icon} className="size-4 shrink-0" />}
                <span className="truncate">{item.label}</span>
              </a>
            ) : (
              <span aria-current="page" className="min-w-0 truncate px-1 font-medium">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
