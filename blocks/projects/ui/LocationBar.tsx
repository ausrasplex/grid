"use client";

// Breadcrumbs: Site ▾ › Building ▾ › Level ▾ › Job ▾ (docs/navigation.md §2).
// Every crumb is a picker: a drop-down on tablet/desktop, a bottom sheet on
// phones. Building hides on one-building sites, Level hides on single-level
// buildings, so a house reads "12 Smith St ▾ › Switchboard upgrade ▾".
// On phones with all four crumbs the site shrinks to an icon; a trail wider
// than the screen scrolls sideways (no scroll bar, a fade on the edge).

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Badge, Icon, Scroller, SearchInput, Sheet, SheetContent, cn, useApi } from "@grid/ui";

export interface LocLevel {
  id: string;
  name: string;
  shortName: string;
  activeJobs: number;
  /** The current job covers this level (shown with a dot). */
  covered?: boolean;
}
export interface LocBuilding {
  id: string;
  name: string;
  kind: "MULTI" | "SINGLE";
  activeJobs: number;
  levels: LocLevel[];
}
export interface LocJob {
  id: string;
  name: string;
  meta?: string;
  href: string;
}

interface Props {
  site: { id: string; name: string; kind: "MANAGED" | "PRIVATE" };
  buildings: LocBuilding[];
  buildingId?: string | null;
  levelId?: string | null;
  job?: { id: string; name: string } | null;
  /** Jobs on the current level/building, for the job picker. */
  jobsHere?: LocJob[];
  /** "All jobs here" from the job picker. */
  allHref?: string;
}

function useWide() {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const wideScreen = window.matchMedia("(min-width: 768px)");
    const set = () => setWide(wideScreen.matches);
    set();
    wideScreen.addEventListener("change", set);
    return () => wideScreen.removeEventListener("change", set);
  }, []);
  return wide;
}

const siteBase = (siteId: string) => `/b/projects/site/${siteId}`;

export function LocationBar({ site, buildings, buildingId, levelId, job, jobsHere = [], allHref }: Props) {
  const building = buildings.find((building) => building.id === buildingId) ?? (buildings.length === 1 ? buildings[0] : undefined);
  const level = building?.levels.find((level) => level.id === levelId);
  // "Choose …" crumbs only appear once you're inside (on a job, or deeper), not on the site page itself.
  const showBuilding = buildings.length > 1 && (!!building || !!job);
  const showLevel = !!building && building.kind === "MULTI" && (!!level || !!job);
  const crumbCount = 1 + (showBuilding ? 1 : 0) + (showLevel ? 1 : 0) + (job ? 1 : 0);
  const rowRef = useRef<HTMLDivElement>(null);

  // Keep the current (last) crumb in view when the location changes.
  useEffect(() => {
    rowRef.current?.lastElementChild?.scrollIntoView({ inline: "end", block: "nearest" });
  }, [site.id, buildingId, levelId, job?.id]);

  return (
    <nav aria-label="Location" className="-mx-4 mb-3 sm:mx-0">
      <Scroller axis="x" className="px-4 sm:px-0">
        <div ref={rowRef} className="flex w-max items-center gap-1 text-sm">
          <SitePicker site={site} iconOnly={crumbCount >= 4} />
          {showBuilding && (
            <>
              <Separator />
              <Picker
                label={building?.name ?? "Choose building"}
                title="Buildings"
                current={!showLevel && !job}
                muted={!building}
                items={buildings.map((buildingOption) => ({
                  key: buildingOption.id,
                  href: `${siteBase(site.id)}/${buildingOption.id}`,
                  label: buildingOption.name,
                  meta: buildingOption.kind === "MULTI" ? `${buildingOption.levels.length} levels · ${buildingOption.activeJobs} active` : `${buildingOption.activeJobs} active`,
                  selected: buildingOption.id === building?.id,
                }))}
              />
            </>
          )}
          {showLevel && building && (
            <>
              <Separator />
              <Picker
                label={level ? level.shortName : "Choose level"}
                fullLabel={level?.name}
                title={`Levels · ${building.name}`}
                current={!job}
                muted={!level}
                items={building.levels.map((levelOption) => ({
                  key: levelOption.id,
                  href: `${siteBase(site.id)}/${building.id}/${levelOption.id}`,
                  label: levelOption.name,
                  meta: `${levelOption.activeJobs} active`,
                  selected: levelOption.id === level?.id,
                  dot: levelOption.covered,
                }))}
              />
            </>
          )}
          {job && (
            <>
              <Separator />
              <Picker
                label={job.name}
                title="Jobs here"
                current
                items={[
                  ...jobsHere.map((jobHere) => ({ key: jobHere.id, href: jobHere.href, label: jobHere.name, meta: jobHere.meta, selected: jobHere.id === job.id })),
                  ...(allHref ? [{ key: "__all", href: allHref, label: "All jobs here", meta: "Including finished jobs", selected: false }] : []),
                ]}
              />
            </>
          )}
        </div>
      </Scroller>
    </nav>
  );
}

function Separator() {
  return <Icon name="chevron-right" aria-hidden className="size-4 shrink-0 text-muted-foreground" />;
}

interface PickItem {
  key: string;
  href: string;
  label: string;
  meta?: string;
  selected: boolean;
  dot?: boolean;
}

function CrumbButton({ label, current, muted, icon, onClick, ariaLabel }: { label?: string; current?: boolean; muted?: boolean; icon?: ReactNode; onClick: () => void; ariaLabel?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-current={current ? "location" : undefined}
      className={cn(
        "flex h-10 shrink-0 items-center gap-1 rounded-md px-2 font-semibold whitespace-nowrap transition-colors hover:bg-muted",
        current ? "text-foreground" : "text-muted-foreground",
        muted && "italic",
      )}
    >
      {icon}
      {label}
      <Icon name="chevron-down" aria-hidden className="size-4 opacity-70" />
    </button>
  );
}

/**
 * A drop-down on tablet/desktop, a bottom sheet on phones. The drop-down is
 * portalled to <body> so the crumb row's sideways scroll and edge fade
 * don't clip it.
 */
function PickerShell({ title, trigger, children, open, setOpen }: { title: string; trigger: ReactNode; children: ReactNode; open: boolean; setOpen: (open: boolean) => void }) {
  const wide = useWide();
  const anchor = useRef<HTMLSpanElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!open || !wide) return;
    const rect = anchor.current!.getBoundingClientRect();
    setPosition({ top: rect.bottom + 4, left: Math.max(8, Math.min(rect.left, window.innerWidth - 336)) });
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent) {
        if (event.key === "Escape") setOpen(false);
        return;
      }
      const target = event.target as Node;
      if (!panel.current?.contains(target) && !anchor.current?.contains(target)) setOpen(false);
    };
    const closePicker = () => setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    window.addEventListener("resize", closePicker);
    window.addEventListener("scroll", closePicker, true);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
      window.removeEventListener("resize", closePicker);
      window.removeEventListener("scroll", closePicker, true);
    };
  }, [open, wide, setOpen]);

  if (!wide) {
    return (
      <>
        {trigger}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent title={title}>{children}</SheetContent>
        </Sheet>
      </>
    );
  }
  return (
    <span ref={anchor} className="shrink-0">
      {trigger}
      {open &&
        position &&
        createPortal(
          <div
            ref={panel}
            role="dialog"
            aria-label={title}
            style={{ top: position.top, left: position.left }}
            className="fixed z-50 max-h-[60vh] w-80 overflow-y-auto rounded-xl border bg-popover p-2 text-popover-foreground shadow-xl"
          >
            <p className="px-2 pt-1 pb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</p>
            {children}
          </div>,
          document.body,
        )}
    </span>
  );
}

function ItemList({ items }: { items: PickItem[] }) {
  return (
    <ul className="flex flex-col">
      {items.map((item) => (
        <li key={item.key}>
          <a
            href={item.href}
            aria-current={item.selected ? "true" : undefined}
            className={cn("flex min-h-touch items-center gap-3 rounded-lg px-3 py-2 hover:bg-muted", item.selected && "bg-accent text-accent-foreground")}
          >
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 font-semibold">
                {item.label}
                {item.dot && <span aria-label="This job works here" className="size-2 rounded-full bg-primary" />}
              </span>
              {item.meta && <span className="block truncate text-sm text-muted-foreground">{item.meta}</span>}
            </span>
            {item.selected && <Icon name="check" className="size-5" />}
          </a>
        </li>
      ))}
    </ul>
  );
}

function Picker({ label, fullLabel, title, items, current, muted }: { label: string; fullLabel?: string; title: string; items: PickItem[]; current?: boolean; muted?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <PickerShell
      title={title}
      open={open}
      setOpen={setOpen}
      trigger={<CrumbButton label={label} ariaLabel={fullLabel ? `${fullLabel}, change` : undefined} current={current} muted={muted} onClick={() => setOpen(!open)} />}
    >
      <ItemList items={items} />
    </PickerShell>
  );
}

interface SiteRow {
  id: string;
  name: string;
  address: string;
  activeJobs: number;
}

function SitePicker({ site, iconOnly }: { site: Props["site"]; iconOnly: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { data } = useApi<SiteRow[]>(open ? `/sites?tab=active${query.trim() ? `&q=${encodeURIComponent(query.trim())}` : ""}` : null);
  return (
    <PickerShell
      title="Sites"
      open={open}
      setOpen={setOpen}
      trigger={
        <CrumbButton
          // With all four crumbs, phones show the site as an icon; wider screens keep the name.
          label={iconOnly ? undefined : site.name}
          ariaLabel={`${site.name}, change site`}
          icon={
            iconOnly ? (
              <>
                <Icon name={site.kind === "MANAGED" ? "building" : "home"} className="size-5 sm:hidden" />
                <span className="hidden sm:inline">{site.name}</span>
              </>
            ) : undefined
          }
          onClick={() => setOpen(!open)}
        />
      }
    >
      <div className="flex flex-col gap-2">
        <SearchInput label="Search sites" placeholder="Address, customer or site" value={query} onChange={(event) => setQuery(event.target.value)} className="px-1" />
        <ItemList
          items={(data ?? []).map((option) => ({
            key: option.id,
            href: `${siteBase(option.id)}/resume`,
            label: option.name,
            meta: `${option.activeJobs} active${option.address !== option.name ? ` · ${option.address}` : ""}`,
            selected: option.id === site.id,
          }))}
        />
        <a href="/b/sites" className="flex min-h-touch items-center gap-2 rounded-lg px-3 text-sm font-semibold text-primary hover:bg-muted">
          All sites, including archived <Badge className="ml-auto">Sites</Badge>
        </a>
      </div>
    </PickerShell>
  );
}
