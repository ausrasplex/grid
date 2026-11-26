"use client";

// App shell, concept C (docs/navigation.md §5, docs/visual-style.md).
//
//   Phone (< 768px):   flat top bar · content · bottom bar of five equal
//                      slots: two items · [action] · two items. The action
//                      button is always dead centre; the sides fill with
//                      Home, primary, main, then other items in order, and
//                      the last slot is More when there are more than four.
//                      (yellow bar over the active item, raised action button)
//   Tablet (768px+):   flat top bar · 88px rail on the left (Home, primary,
//                      More, Scan, avatar) · content
//   Desktop (1024px+): 232px sidebar (company, Home, primary, main, then
//                      everything else: no More, every item shows, you)
//                      · flat top row with header actions · content
//
// Chrome uses the page colour; the rail and sidebar have a thin right
// border. Nothing shows a scrollbar on phones/tablets (Scroller fades).
// Everything respects iPhone/Android safe areas.
//
// The Soft look (look="soft", Settings › Profile › Appearance) copies
// Docket's shell (docket/components/shell): a 224px sidebar with Grid's
// mark and name, the centre button as a navy pill at the top of the list,
// then the menu (14px semibold, 12px corners, the current page a white tile,
// a faint ink wash on hover). The top bar sits over the content only, frosted
// page colour with a line under it: the business as a white pill on the left,
// your picture (initials on a pastel circle) on the right, both lined up with
// the content's 1100px centred column. Sign out is in the sheet your picture
// opens. Phones: the Grid mark at the top left, and a white bottom bar whose
// current item is a tinted tile, with the round centre button raised.

import { useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { Crumbs, Icon, Scroller, Sheet, SheetContent, SheetTrigger, cn, type Look } from "@grid/ui";
import { authClient } from "@/lib/auth-client";

export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon?: string;
  /** Other path prefixes that highlight this item (MenuItem.activeFor). */
  activeFor?: string[];
}

interface Props {
  home: NavItem;
  /** Phone bar, rail and sidebar. The phone bar shows the first two. */
  primary: NavItem[];
  /** Desktop sidebar top list; under More on phone and tablet. */
  main: NavItem[];
  /** Under More everywhere. */
  more: NavItem[];
  /** The raised centre button: Scan, or Take a photo for a sole trader (docs/navigation.md §5a). */
  scan: NavItem;
  headerActions: NavItem[];
  account: NavItem[];
  /** Pages reached from Settings: they get a "Settings › Clients" breadcrumb. */
  settings: NavItem[];
  user: { name: string; email: string; avatarUrl: string | null };
  company: { name: string; role: string } | null;
  /** Grid (concept C) or the Soft trial look. */
  look?: Look;
  children: ReactNode;
}

/** The Settings page this address belongs to (the longest match, so /business/roles/abc is Roles), or null. */
function settingsPageFor(pathname: string, pages: NavItem[]): NavItem | null {
  if (pathname === "/settings") return null;
  const matches = pages.filter((page) => pathname === page.href || pathname.startsWith(page.href + "/"));
  return matches.sort((first, second) => second.href.length - first.href.length)[0] ?? null;
}

/** "Settings › Clients" above a settings page (docs/navigation.md §2). */
function SettingsCrumbs({ page }: { page: NavItem }) {
  return <Crumbs items={[{ label: "Settings", href: "/settings", icon: "settings" }, { label: page.label }]} />;
}

function isActive(pathname: string, item: NavItem) {
  const under = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/"));
  return under(item.href) || (item.activeFor ?? []).some(under);
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0]!.toUpperCase())
      .join("") || "?"
  );
}

async function signOut() {
  await authClient.signOut();
  await fetch("/api/session/company", { method: "DELETE" });
  window.location.href = "/sign-in";
}

/** Grid's icon (made from public/icon.png, see lib/app-icon.ts). */
function Mark({ className }: { className?: string }) {
  return <img src="/icon/96" alt="" width={36} height={36} className={cn("size-9 shrink-0 rounded-md", className)} />;
}

/** Soft look: initials sit on one of the three pastel tiles, picked from the name so it stays the same (as Docket). */
const AVATAR_TILES = ["bg-tile-1", "bg-tile-2", "bg-tile-3"];

function avatarTile(name: string) {
  const total = [...name].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return AVATAR_TILES[total % AVATAR_TILES.length];
}

function UserAvatar({ name, src, soft, className }: { name: string; src: string | null; soft?: boolean; className?: string }) {
  if (src) return <img src={src} alt="" className={cn("size-9 shrink-0 rounded-full bg-muted object-cover", className)} />;
  return (
    <span
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold",
        soft ? cn(avatarTile(name), "text-tile-foreground") : "bg-primary text-primary-foreground",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

/** Account sheet: profile items, switch company, sign out. Opened from the avatar. */
function AccountSheet({
  trigger,
  user,
  account,
  switcher,
  triggerClassName,
}: {
  trigger: ReactNode;
  user: Props["user"];
  account: NavItem[];
  switcher?: NavItem;
  triggerClassName?: string;
}) {
  const items = switcher ? [...account, switcher] : account;
  return (
    <Sheet>
      <SheetTrigger aria-label="Account" className={cn("cursor-pointer", triggerClassName)}>
        {trigger}
      </SheetTrigger>
      {/* Phones: bottom sheet. Tablet and desktop: slides in from the right, under the avatar. */}
      <SheetContent title={user.name} description={user.email}>
        <ul className="flex flex-col">
          {items.map((item) => (
            <li key={item.id}>
              <a href={item.href} className="flex min-h-touch-lg items-center gap-3 rounded-lg px-3 hover:bg-muted active:bg-muted">
                <Icon name={item.icon} className="size-5 text-muted-foreground" />
                {item.label}
              </a>
            </li>
          ))}
          <li>
            <button
              onClick={signOut}
              className="flex min-h-touch-lg w-full items-center gap-3 rounded-lg px-3 text-left text-destructive hover:bg-muted"
            >
              <LogOut aria-hidden className="size-5" />
              Sign out
            </button>
          </li>
        </ul>
      </SheetContent>
    </Sheet>
  );
}

/** "More" sheet for phone and tablet: everything not pinned to the bar or rail. */
function MoreSheet({ items, trigger, triggerClassName }: { items: NavItem[]; trigger: ReactNode; triggerClassName?: string }) {
  return (
    <Sheet>
      <SheetTrigger className={cn("cursor-pointer", triggerClassName)}>{trigger}</SheetTrigger>
      <SheetContent title="More">
        <Scroller className="max-h-[60dvh]">
          <ul className="grid grid-cols-3 gap-2 p-1">
            {items.map((item) => (
              <li key={item.id}>
                <a
                  href={item.href}
                  className="flex aspect-square flex-col items-center justify-center gap-2 rounded-xl bg-muted px-1 text-center text-sm font-medium active:bg-accent active:text-accent-foreground"
                >
                  <Icon name={item.icon} className="size-7" />
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </Scroller>
      </SheetContent>
    </Sheet>
  );
}

export function ShellNav({ home, primary, main, more, scan, headerActions, account, settings, user, company, look = "grid", children }: Props) {
  const soft = look === "soft";
  const pathname = usePathname();
  const settingsPage = settingsPageFor(pathname, settings);
  const switcher = headerActions.find((headerAction) => headerAction.id === "companies.switcher");
  const actions = headerActions.filter((headerAction) => headerAction !== switcher);
  const search = actions.find((action) => action.icon === "search");

  // Jump to search from anywhere: Ctrl/⌘ + K (docs/navigation.md §6).
  useEffect(() => {
    if (!search) return;
    const onKey = (keyboardEvent: KeyboardEvent) => {
      if ((keyboardEvent.metaKey || keyboardEvent.ctrlKey) && keyboardEvent.key.toLowerCase() === "k") {
        keyboardEvent.preventDefault();
        window.location.href = search.href;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [search]);

  // Tablet rail: anything not pinned goes under More.
  const compactMore = [...primary.slice(2), ...main, ...more];
  const moreActive = compactMore.some((item) => isActive(pathname, item));
  // Phone bar: four slots around the centre action button, filled in menu order.
  // With more than four items, the fourth slot is More (holding the rest).
  const phoneItems = [home, ...primary, ...main, ...more];
  const phoneNeedsMore = phoneItems.length > 4;
  const phoneShown = phoneNeedsMore ? phoneItems.slice(0, 3) : phoneItems;
  const phoneMore = phoneNeedsMore ? phoneItems.slice(3) : [];
  const phoneMoreActive = phoneMore.some((item) => isActive(pathname, item));
  /** The four side slots, left to right; null is an empty slot (keeps the action centred). */
  const phoneSlots: (NavItem | "more" | null)[] = [...phoneShown, ...(phoneNeedsMore ? (["more"] as const) : [])];
  while (phoneSlots.length < 4) phoneSlots.push(null);

  const companyBlock = (
    <span className="min-w-0">
      <span className="block truncate font-semibold leading-tight">{company?.name ?? "Choose a company"}</span>
      {company && <span className="block truncate text-xs text-muted-foreground">{company.role}</span>}
    </span>
  );

  return (
    <div className={cn("min-h-dvh md:pl-rail", soft ? "lg:pl-56" : "lg:pl-sidebar")}>
      {/* ---------- Top bar (flat, page colour, 1px line under it). Soft: frosted, over the content only ---------- */}
      <header
        className={cn(
          "fixed inset-x-0 top-0 z-40 border-b pt-safe md:left-rail",
          soft
            ? "bg-[color-mix(in_srgb,var(--background)_72%,transparent)] backdrop-blur-[16px] backdrop-saturate-[1.4] lg:left-56 lg:px-8"
            : "bg-background/95 backdrop-blur lg:left-sidebar",
        )}
      >
        <div className={cn("flex h-topbar items-center gap-1 pl-safe pr-safe", soft && "lg:mx-auto lg:h-[4.5rem] lg:max-w-[1100px] lg:gap-2.5")}>
          {/* Soft, phones: Grid's mark is the way Home (the tablet rail and desktop sidebar have their own) */}
          {soft && (
            <a href="/" aria-label="Home" className="ml-2 shrink-0 md:hidden">
              <Mark className="size-10 rounded-[10px]" />
            </a>
          )}
          {/* Company switcher: phone and tablet (desktop has it in the sidebar); Soft: a pill everywhere */}
          <div className={cn("flex min-w-0 flex-1 items-center px-2 md:px-4", soft ? "lg:px-0" : "lg:invisible")}>
            {soft ? (
              <a
                href={switcher?.href ?? "/"}
                className="flex min-h-touch min-w-0 items-center gap-2 rounded-full bg-card px-4 text-sm font-semibold text-foreground hover:bg-muted"
                title={company ? `${company.name} · ${company.role}` : undefined}
              >
                <span className="truncate">{company?.name ?? "Choose a business"}</span>
                {switcher && <Icon name="chevron-down" className="size-3.5 shrink-0 text-muted-foreground" />}
              </a>
            ) : (
              <a
                href={switcher?.href ?? "/"}
                className="flex min-h-touch min-w-0 items-center gap-1.5 rounded-lg px-2 hover:bg-muted active:bg-muted"
              >
                {companyBlock}
                {switcher && <Icon name="chevron-down" className="size-4 shrink-0 text-muted-foreground" />}
              </a>
            )}
          </div>

          {actions.map((action) =>
            action === search ? (
              // Search: an icon on phones, a box with the shortcut from tablet up.
              <a
                key={action.id}
                href={action.href}
                aria-label="Jump to (Ctrl K)"
                className={cn(
                  "inline-flex size-touch items-center justify-center gap-2 text-nav-foreground md:mr-1 md:w-64 md:justify-start md:px-3 md:text-sm md:text-muted-foreground",
                  soft
                    ? "rounded-full hover:bg-[color-mix(in_srgb,var(--foreground)_7%,transparent)] md:h-touch md:bg-card md:px-4 md:font-semibold md:hover:bg-muted lg:mr-0"
                    : "rounded-lg hover:bg-muted md:h-10 md:bg-muted",
                )}
              >
                <Icon name="search" className="size-5" />
                <span className="hidden flex-1 md:inline">Jump to…</span>
                <kbd className="hidden rounded border px-1.5 text-xs md:inline">Ctrl K</kbd>
              </a>
            ) : (
              <a
                key={action.id}
                href={action.href}
                aria-label={action.label}
                className={cn(
                  "inline-flex size-touch items-center justify-center text-nav-foreground",
                  soft ? "rounded-full hover:bg-[color-mix(in_srgb,var(--foreground)_7%,transparent)] hover:text-foreground" : "rounded-lg hover:bg-muted",
                )}
              >
                <Icon name={action.icon} className="size-5" />
              </a>
            ),
          )}

          {/* Avatar: phone only (tablet rail and desktop sidebar have their own); Soft: every size, 44px */}
          <AccountSheet
            user={user}
            account={account}
            switcher={switcher}
            trigger={<UserAvatar name={user.name} src={user.avatarUrl} soft={soft} className={soft ? "size-11 text-base" : undefined} />}
            triggerClassName={cn("mr-2 inline-flex size-touch items-center justify-center rounded-full", soft ? "lg:mr-0" : "md:hidden")}
          />
          <span className={cn("hidden w-2 md:block", soft && "lg:hidden")} />
        </div>
      </header>

      {/* ---------- Tablet rail (768–1023px) ---------- */}
      <nav
        aria-label="Main"
        className="fixed inset-y-0 left-0 z-30 hidden w-rail flex-col items-center gap-1 border-r bg-nav pt-safe pb-safe pl-safe md:flex lg:hidden"
      >
        <a href="/" aria-label="Home" className="mt-4 mb-3">
          <Mark className={cn("size-10", soft && "rounded-[10px]")} />
        </a>
        {[home, ...primary].map((item) => {
          const active = isActive(pathname, item);
          return (
            <a
              key={item.id}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={railItem(active, soft)}
            >
              <span className={railIcon(active, soft)}>
                <Icon name={item.icon} className="size-6" />
              </span>
              <span className="max-w-full truncate px-1">{item.label}</span>
            </a>
          );
        })}
        {compactMore.length > 0 && (
          <MoreSheet
            items={compactMore}
            triggerClassName={railItem(moreActive, soft)}
            trigger={
              <>
                <span className={railIcon(moreActive, soft)}>
                  <Icon name="more" className="size-6" />
                </span>
                More
              </>
            }
          />
        )}
        <a
          href={scan.href}
          aria-label={scan.label}
          className={cn("mt-3 flex size-14 items-center justify-center bg-primary text-primary-foreground active:opacity-90", soft ? "rounded-full shadow-[0_6px_16px_rgba(0,0,0,.22)]" : "rounded-xl")}
        >
          <Icon name={scan.icon ?? "scan"} className="size-7" />
        </a>
        <span className="flex-1" />
        {/* Soft: your picture is in the top bar instead (Sign out is in its sheet). */}
        {!soft && (
          <AccountSheet
            user={user}
            account={account}
            switcher={switcher}
            trigger={<UserAvatar name={user.name} src={user.avatarUrl} className="size-10" />}
            triggerClassName="mb-4 rounded-full"
          />
        )}
      </nav>

      {/* ---------- Desktop sidebar (1024px+) ---------- */}
      {soft ? (
        // Docket's sidebar: 224px, 18px in from the sides, 28px top and bottom; the mark and name, then the list
        // with the centre button as its first item.
        <nav
          aria-label="Main"
          className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col gap-7 border-r bg-nav px-[18px] pt-[calc(env(safe-area-inset-top)+1.75rem)] pb-[calc(env(safe-area-inset-bottom)+1.75rem)] lg:flex"
        >
          <a href="/" aria-label="Grid home" className="flex items-center gap-2.5 px-2 text-lg font-bold tracking-tight text-foreground">
            <Mark className="size-8 rounded-lg" />
            Grid
          </a>
          <Scroller className="-mx-1 flex-1 px-1">
            <ul className="flex flex-col gap-1.5">
              <li className="mb-2.5">
                {/* The centre button, as the pill at the top of the list */}
                <a
                  href={scan.href}
                  className="flex min-h-touch w-full items-center justify-center gap-2.5 rounded-full bg-primary text-sm font-bold text-primary-foreground shadow-[0_6px_16px_rgba(0,0,0,.22)] hover:shadow-[0_6px_16px_rgba(0,0,0,.22),inset_0_0_0_999px_color-mix(in_srgb,var(--primary-foreground)_14%,transparent)]"
                >
                  <Icon name={scan.icon ?? "scan"} className="size-5" />
                  {scan.label}
                </a>
              </li>
              {[home, ...primary, ...main].map((item) => (
                <li key={item.id}>
                  <SidebarLink item={item} active={isActive(pathname, item)} soft />
                </li>
              ))}
              {/* Desktop shows every item: what's under More on phones and tablets follows, after a line. */}
              {more.length > 0 && <li aria-hidden className="mx-3.5 my-1 border-t" />}
              {more.map((item) => (
                <li key={item.id}>
                  <SidebarLink item={item} active={isActive(pathname, item)} soft />
                </li>
              ))}
            </ul>
          </Scroller>
        </nav>
      ) : (
        <nav
          aria-label="Main"
          className="fixed inset-y-0 left-0 z-30 hidden w-sidebar flex-col gap-4 border-r bg-nav px-3 pt-[calc(env(safe-area-inset-top)+1.25rem)] pb-[calc(env(safe-area-inset-bottom)+1rem)] lg:flex"
        >
          <a href={switcher?.href ?? "/"} className="flex min-h-touch items-center gap-2.5 rounded-lg px-2 hover:bg-muted" title={switcher?.label}>
            <Mark />
            {companyBlock}
          </a>
          <Scroller className="-mx-1 flex-1 px-1">
            <ul className="flex flex-col gap-1">
              {[home, ...primary, ...main].map((item) => (
                <li key={item.id}>
                  <SidebarLink item={item} active={isActive(pathname, item)} soft={false} />
                </li>
              ))}
              {/* Desktop shows every item: what's under More on phones and tablets follows, after a line. */}
              {more.length > 0 && <li aria-hidden className="mx-3.5 my-1 border-t" />}
              {more.map((item) => (
                <li key={item.id}>
                  <SidebarLink item={item} active={isActive(pathname, item)} soft={false} />
                </li>
              ))}
            </ul>
          </Scroller>
          <AccountSheet
            user={user}
            account={account}
            switcher={switcher}
            triggerClassName="flex min-h-touch items-center gap-2.5 rounded-lg px-2 text-left hover:bg-muted"
            trigger={
              <>
                <UserAvatar name={user.name} src={user.avatarUrl} className="size-8 text-xs" />
                <span className="min-w-0 truncate text-sm text-muted-foreground">
                  {user.name}
                  {company ? ` · ${company.role}` : ""}
                </span>
              </>
            }
          />
        </nav>
      )}

      {/* ---------- Content ---------- */}
      <main
        className={cn(
          "mx-auto w-full max-w-5xl px-4 pt-shell pb-shell sm:px-6 md:pb-10",
          // Soft: Docket's 1100px centred column with 32px either side, lined up with the top bar's pill and picture,
          // the title 18px under the taller (72px) top bar.
          soft
            ? "lg:max-w-[calc(1100px+4rem)] lg:px-8 lg:pt-[calc(4.5rem+1px+env(safe-area-inset-top)+1.25rem)]"
            : "lg:mx-0 lg:max-w-[110rem] lg:px-10 xl:px-12",
        )}
      >
        {settingsPage && <SettingsCrumbs page={settingsPage} />}
        {children}
      </main>

      {/* ---------- Phone bottom bar ---------- */}
      {/* Soft: Docket's tab bar, white with a line above, 6px around the items */}
      <nav aria-label="Main" className={cn("fixed inset-x-0 bottom-0 z-40 border-t bg-dock pb-safe md:hidden", soft && "pl-safe pr-safe")}>
        <ul className={cn("grid grid-cols-5 items-stretch", soft ? "h-[4.5rem] gap-0.5 px-2 py-1.5" : "h-bottomnav pl-safe pr-safe")}>
          {phoneSlots.slice(0, 2).map((slot, index) => (
            <PhoneSlot key={index} slot={slot} pathname={pathname} more={phoneMore} moreActive={phoneMoreActive} soft={soft} />
          ))}
          <li className={cn("flex justify-center", soft && "items-start")}>
            <a
              href={scan.href}
              aria-label={scan.label}
              className={cn(
                "flex items-center justify-center bg-primary text-primary-foreground active:opacity-90",
                soft
                  ? "-mt-[18px] size-14 rounded-full shadow-[0_6px_16px_rgba(0,0,0,.22)]"
                  : "-mt-6 size-16 rounded-2xl border-4 border-background shadow-lg",
              )}
            >
              <Icon name={scan.icon ?? "scan"} className="size-7" />
            </a>
          </li>
          {phoneSlots.slice(2).map((slot, index) => (
            <PhoneSlot key={index + 2} slot={slot} pathname={pathname} more={phoneMore} moreActive={phoneMoreActive} soft={soft} />
          ))}
        </ul>
      </nav>
    </div>
  );
}

/** One side slot of the phone bar: a menu item, More, or empty (so the action button stays centred). */
function PhoneSlot({ slot, pathname, more, moreActive, soft }: { slot: NavItem | "more" | null; pathname: string; more: NavItem[]; moreActive: boolean; soft: boolean }) {
  if (slot === null) return <li aria-hidden />;
  if (slot !== "more") return <BarItem item={slot} active={isActive(pathname, slot)} soft={soft} />;
  return (
    <li>
      <MoreSheet
        items={more}
        triggerClassName={barItem(moreActive, soft, "w-full")}
        trigger={
          <>
            <BarIcon name="more" soft={soft} />
            More
          </>
        }
      />
    </li>
  );
}

/** A desktop sidebar link. */
function SidebarLink({ item, active, soft }: { item: NavItem; active: boolean; soft: boolean }) {
  return (
    <a href={item.href} aria-current={active ? "page" : undefined} className={sidebarItem(active, soft)}>
      <Icon name={item.icon} className="size-5" />
      <span className="truncate">{item.label}</span>
    </a>
  );
}

/** Ink at 7% over whatever is behind: Docket's hover for menu items and plain icon buttons. */
const SOFT_HOVER = "hover:bg-[color-mix(in_srgb,var(--foreground)_7%,transparent)] hover:text-foreground";

/**
 * A desktop sidebar item. Grid: highlighted in the accent colour.
 * Soft (Docket): 44px, 12px corners, 14px semibold; the current page a white tile with a hairline shadow.
 */
function sidebarItem(active: boolean, soft: boolean) {
  if (soft) {
    return cn(
      "flex min-h-touch items-center gap-3 rounded-[12px] px-3.5 text-sm font-semibold",
      active ? "bg-card text-foreground shadow-[0_1px_2px_rgba(0,0,0,.08)]" : cn("text-muted-foreground", SOFT_HOVER),
    );
  }
  return cn(
    "flex min-h-touch items-center gap-3 rounded-lg px-3.5 text-[15px] font-medium transition-colors",
    active ? "bg-accent font-semibold text-accent-foreground" : "text-nav-foreground hover:bg-muted",
  );
}

/** A tablet rail item (Grid only has a rail; Soft gives it the sidebar's white tile and hover). */
function railItem(active: boolean, soft: boolean) {
  return cn(
    "flex w-full flex-col items-center gap-1 py-2 text-xs",
    soft ? "font-semibold" : "font-medium",
    active ? (soft ? "text-foreground" : "text-nav-active") : soft ? "group text-muted-foreground hover:text-foreground" : "text-nav-foreground",
  );
}

function railIcon(active: boolean, soft: boolean) {
  return cn(
    "flex h-8 w-14 items-center justify-center",
    soft ? "rounded-[12px]" : "rounded-full",
    active && (soft ? "bg-card shadow-[0_1px_2px_rgba(0,0,0,.08)]" : "bg-accent text-accent-foreground"),
    !active && soft && "group-hover:bg-[color-mix(in_srgb,var(--foreground)_7%,transparent)]",
  );
}

/** Phone bar item. Grid: yellow bar across the top of the active one. Soft (Docket): the whole item is a tinted tile. */
function barItem(active: boolean, soft: boolean, extra?: string) {
  if (soft) {
    return cn(
      "flex h-full flex-col items-center justify-center gap-0.5 rounded-[12px] px-0.5 text-[11px] font-semibold",
      active ? "bg-accent text-foreground" : "text-muted-foreground",
      extra,
    );
  }
  return cn(
    "-mt-px flex h-full flex-col items-center justify-center gap-0.5 border-t-[3px] text-xs",
    active ? "border-nav-active font-bold text-nav-active" : "border-transparent font-medium text-nav-foreground",
    extra,
  );
}

function BarIcon({ name, soft }: { name?: string; soft: boolean }) {
  return <Icon name={name} className={soft ? "size-5" : "size-6"} />;
}

function BarItem({ item, active, soft }: { item: NavItem; active: boolean; soft: boolean }) {
  return (
    <li className="min-w-0">
      <a href={item.href} aria-current={active ? "page" : undefined} className={barItem(active, soft)}>
        <BarIcon name={item.icon} soft={soft} />
        <span className="max-w-full truncate px-1">{item.label}</span>
      </a>
    </li>
  );
}
