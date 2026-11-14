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

import { useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { Crumbs, Icon, Scroller, Sheet, SheetContent, SheetTrigger, cn } from "@grid/ui";
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

function UserAvatar({ name, src, className }: { name: string; src: string | null; className?: string }) {
  if (src) return <img src={src} alt="" className={cn("size-9 shrink-0 rounded-full bg-muted object-cover", className)} />;
  return (
    <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground", className)}>
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
      <SheetTrigger aria-label="Account" className={triggerClassName}>
        {trigger}
      </SheetTrigger>
      <SheetContent
        title={user.name}
        description={user.email}
        side="bottom"
        className="md:inset-x-auto md:bottom-4 md:left-4 md:w-96 md:rounded-2xl md:border"
      >
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
      <SheetTrigger className={triggerClassName}>{trigger}</SheetTrigger>
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

export function ShellNav({ home, primary, main, more, scan, headerActions, account, settings, user, company, children }: Props) {
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
    <div className="min-h-dvh md:pl-rail lg:pl-sidebar">
      {/* ---------- Top bar (flat, page colour, 1px line under it) ---------- */}
      <header className="fixed inset-x-0 top-0 z-40 border-b bg-background/95 pt-safe backdrop-blur md:left-rail lg:left-sidebar">
        <div className="flex h-topbar items-center gap-1 pl-safe pr-safe">
          {/* Company switcher: phone and tablet (desktop has it in the sidebar) */}
          <div className="flex min-w-0 flex-1 items-center px-2 md:px-4 lg:invisible">
            <a
              href={switcher?.href ?? "/"}
              className="flex min-h-touch min-w-0 items-center gap-1.5 rounded-lg px-2 hover:bg-muted active:bg-muted"
            >
              {companyBlock}
              {switcher && <Icon name="chevron-down" className="size-4 shrink-0 text-muted-foreground" />}
            </a>
          </div>

          {actions.map((action) =>
            action === search ? (
              // Search: an icon on phones, a box with the shortcut from tablet up.
              <a
                key={action.id}
                href={action.href}
                aria-label="Jump to (Ctrl K)"
                className="inline-flex size-touch items-center justify-center gap-2 rounded-lg text-nav-foreground hover:bg-muted md:mr-1 md:h-10 md:w-64 md:justify-start md:bg-muted md:px-3 md:text-sm md:text-muted-foreground"
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
                className="inline-flex size-touch items-center justify-center rounded-lg text-nav-foreground hover:bg-muted"
              >
                <Icon name={action.icon} className="size-5" />
              </a>
            ),
          )}

          {/* Avatar: phone only (tablet rail and desktop sidebar have their own) */}
          <AccountSheet
            user={user}
            account={account}
            switcher={switcher}
            trigger={<UserAvatar name={user.name} src={user.avatarUrl} />}
            triggerClassName="mr-2 inline-flex size-touch items-center justify-center rounded-full md:hidden"
          />
          <span className="hidden w-2 md:block" />
        </div>
      </header>

      {/* ---------- Tablet rail (768–1023px) ---------- */}
      <nav
        aria-label="Main"
        className="fixed inset-y-0 left-0 z-30 hidden w-rail flex-col items-center gap-1 border-r bg-nav pt-safe pb-safe pl-safe md:flex lg:hidden"
      >
        <a href="/" aria-label="Home" className="mt-4 mb-3">
          <Mark className="size-10" />
        </a>
        {[home, ...primary].map((item) => {
          const active = isActive(pathname, item);
          return (
            <a
              key={item.id}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn("flex w-full flex-col items-center gap-1 py-2 text-xs font-medium", active ? "text-nav-active" : "text-nav-foreground")}
            >
              <span className={cn("flex h-8 w-14 items-center justify-center rounded-full", active && "bg-accent text-accent-foreground")}>
                <Icon name={item.icon} className="size-6" />
              </span>
              <span className="max-w-full truncate px-1">{item.label}</span>
            </a>
          );
        })}
        {compactMore.length > 0 && (
          <MoreSheet
            items={compactMore}
            triggerClassName={cn("flex w-full flex-col items-center gap-1 py-2 text-xs font-medium", moreActive ? "text-nav-active" : "text-nav-foreground")}
            trigger={
              <>
                <span className={cn("flex h-8 w-14 items-center justify-center rounded-full", moreActive && "bg-accent text-accent-foreground")}>
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
          className="mt-3 flex size-14 items-center justify-center rounded-xl bg-primary text-primary-foreground active:opacity-90"
        >
          <Icon name={scan.icon ?? "scan"} className="size-7" />
        </a>
        <span className="flex-1" />
        <AccountSheet
          user={user}
          account={account}
          switcher={switcher}
          trigger={<UserAvatar name={user.name} src={user.avatarUrl} className="size-10" />}
          triggerClassName="mb-4 rounded-full"
        />
      </nav>

      {/* ---------- Desktop sidebar (1024px+) ---------- */}
      <nav
        aria-label="Main"
        className="fixed inset-y-0 left-0 z-30 hidden w-sidebar flex-col gap-4 border-r bg-nav px-3 pt-[calc(env(safe-area-inset-top)+1.25rem)] pb-[calc(env(safe-area-inset-bottom)+1rem)] lg:flex"
      >
        <a
          href={switcher?.href ?? "/"}
          className="flex min-h-touch items-center gap-2.5 rounded-lg px-2 hover:bg-muted"
          title={switcher?.label}
        >
          <Mark />
          {companyBlock}
        </a>
        <Scroller className="-mx-1 flex-1 px-1">
          <ul className="flex flex-col gap-1">
            {[home, ...primary, ...main].map((item) => {
              const active = isActive(pathname, item);
              return (
                <li key={item.id}>
                  <a
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-h-touch items-center gap-3 rounded-lg px-3.5 text-[15px] font-medium transition-colors",
                      active ? "bg-accent font-semibold text-accent-foreground" : "text-nav-foreground hover:bg-muted",
                    )}
                  >
                    <Icon name={item.icon} className="size-5" />
                    <span className="truncate">{item.label}</span>
                  </a>
                </li>
              );
            })}
            {/* Desktop shows every item: what's under More on phones and tablets follows, after a line. */}
            {more.length > 0 && <li aria-hidden className="mx-3.5 my-1 border-t" />}
            {more.map((item) => {
              const active = isActive(pathname, item);
              return (
                <li key={item.id}>
                  <a
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-h-touch items-center gap-3 rounded-lg px-3.5 text-[15px] font-medium transition-colors",
                      active ? "bg-accent font-semibold text-accent-foreground" : "text-nav-foreground hover:bg-muted",
                    )}
                  >
                    <Icon name={item.icon} className="size-5" />
                    <span className="truncate">{item.label}</span>
                  </a>
                </li>
              );
            })}
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

      {/* ---------- Content ---------- */}
      <main className="mx-auto w-full max-w-5xl px-4 pt-shell pb-shell sm:px-6 md:pb-10 lg:mx-0 lg:max-w-[110rem] lg:px-10 xl:px-12">
        {settingsPage && <SettingsCrumbs page={settingsPage} />}
        {children}
      </main>

      {/* ---------- Phone bottom bar ---------- */}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t bg-dock pb-safe md:hidden">
        <ul className="grid h-bottomnav grid-cols-5 items-stretch pl-safe pr-safe">
          {phoneSlots.slice(0, 2).map((slot, index) => (
            <PhoneSlot key={index} slot={slot} pathname={pathname} more={phoneMore} moreActive={phoneMoreActive} />
          ))}
          <li className="flex justify-center">
            <a
              href={scan.href}
              aria-label={scan.label}
              className="-mt-6 flex size-16 items-center justify-center rounded-2xl border-4 border-background bg-primary text-primary-foreground shadow-lg active:opacity-90"
            >
              <Icon name={scan.icon ?? "scan"} className="size-7" />
            </a>
          </li>
          {phoneSlots.slice(2).map((slot, index) => (
            <PhoneSlot key={index + 2} slot={slot} pathname={pathname} more={phoneMore} moreActive={phoneMoreActive} />
          ))}
        </ul>
      </nav>
    </div>
  );
}

/** One side slot of the phone bar: a menu item, More, or empty (so the action button stays centred). */
function PhoneSlot({ slot, pathname, more, moreActive }: { slot: NavItem | "more" | null; pathname: string; more: NavItem[]; moreActive: boolean }) {
  if (slot === null) return <li aria-hidden />;
  if (slot !== "more") return <BarItem item={slot} active={isActive(pathname, slot)} />;
  return (
    <li>
      <MoreSheet
        items={more}
        triggerClassName={cn(
          "flex h-full w-full flex-col items-center justify-center gap-0.5 border-t-[3px] text-xs",
          moreActive ? "border-nav-active font-bold text-nav-active" : "border-transparent font-medium text-nav-foreground",
        )}
        trigger={
          <>
            <Icon name="more" className="size-6" />
            More
          </>
        }
      />
    </li>
  );
}

/** Phone bar item: yellow bar across the top of the active item. */
function BarItem({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <li className="min-w-0">
      <a
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "-mt-px flex h-full flex-col items-center justify-center gap-0.5 border-t-[3px] text-xs",
          active ? "border-nav-active font-bold text-nav-active" : "border-transparent font-medium text-nav-foreground",
        )}
      >
        <Icon name={item.icon} className="size-6" />
        <span className="max-w-full truncate px-1">{item.label}</span>
      </a>
    </li>
  );
}
