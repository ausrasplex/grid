// Gathers every menu item from the blocks (filtered by what's switched on
// and the user's permissions) and hands them to the client-side nav.
// Where each item shows is set by its `prominence` (docs/navigation.md §5).
import type { ReactNode } from "react";
import type { MenuItem } from "@grid/core";
import type { AppContext } from "@/lib/context";
import { registry } from "@/blocks";
import { ShellNav, type NavItem } from "./ShellNav";

/** Core settings page (not a Block): password and signed-in devices. */
export const SECURITY: NavItem = { id: "core.security", label: "Sign-in & devices", href: "/settings/security", icon: "key" };

/** Settings for the whole server, for the server admin (Settings › Server). */
export const SERVER_SETTINGS: (NavItem & { description: string })[] = [
  { id: "core.email", label: "Email", href: "/settings/email", icon: "mail", description: "The email server for sign-in links and password resets" },
  { id: "core.backups", label: "Backups", href: "/settings/backups", icon: "archive", description: "Database and photos: schedule, Back up now, downloads" },
  { id: "core.storage", label: "Storage", href: "/settings/storage", icon: "archive", description: "Space used, clean-up settings and history" },
  { id: "core.maps", label: "Maps", href: "/settings/maps", icon: "map", description: "Google address suggestions while typing an address" },
  { id: "core.rendering", label: "Plans & PDFs", href: "/settings/plans-pdfs", icon: "layers", description: "How sharp plans, documents and quote PDFs are drawn" },
  { id: "core.accounts", label: "Accounts & devices", href: "/settings/accounts", icon: "users", description: "Everyone with an account here, their devices, and every business" },
];

const toNav = (item: MenuItem): NavItem => ({ id: item.id, label: item.label, href: item.href, icon: item.icon, activeFor: item.activeFor });

/**
 * The raised centre button (docs/navigation.md §5a).
 *  - Sole trader with the Photos block: Take a photo.
 *  - Otherwise: Scan.
 *  - Later (phases 7–8): an Actions menu (shell.quick) once checked in to a site.
 */
function centreButton(ctx: AppContext): NavItem {
  if (ctx.solo && ctx.enabledBlocks.has("photos")) {
    return { id: "core.photo", label: "Take a photo", href: "/photos/capture", icon: "camera" };
  }
  return { id: "core.scan", label: "Scan", href: "/scan", icon: "scan" };
}

/**
 * Every page that belongs under Settings, for its "Settings › Backups" trail.
 * Unlike the Settings page's own list, nothing is left out because it's
 * hidden right now (team-only while solo, someone else's permission, the
 * server pages): whoever lands on the page sees the same trail. Plus the
 * settings-type pages Settings doesn't list (Switch business).
 */
function settingsPages(ctx: AppContext): NavItem[] {
  const fromBlocks = registry.blocks
    .filter((block) => block.required || ctx.enabledBlocks.has(block.id))
    .flatMap((block) => block.menus ?? [])
    .filter((item) => item.slot === "settings.user" || item.slot === "settings.company")
    // Two items to one page (Members, and "Add a team member" while solo): the page's own name wins.
    .sort((first, second) => Number(!!first.soloOnly) - Number(!!second.soloOnly))
    .map((item) => ({ ...toNav(item), label: ctx.solo && item.soloLabel ? item.soloLabel : item.label }));
  const all = [...fromBlocks, SECURITY, ...SERVER_SETTINGS, { id: "core.switch", label: "Switch business", href: "/business/switch", icon: "building" }];
  return all.filter((item, index) => all.findIndex((other) => other.href === item.href) === index);
}

/** A group on the Settings page: You, the business, Server. */
export interface SettingsSection {
  id: "you" | "business" | "server";
  title: string;
  description?: string;
  items: (NavItem & { description?: string })[];
}

/**
 * What the Settings page lists for this person right now (permissions,
 * solo, server admin). Also where pinned pages come from, so a pin only
 * shows while its page is still yours to open.
 */
export function settingsSections(ctx: AppContext): SettingsSection[] {
  const sections: SettingsSection[] = [{ id: "you", title: "You", items: [...registry.menusFor("settings.user", ctx).map(toNav), SECURITY] }];
  if (ctx.company) sections.push({ id: "business", title: ctx.company.name, items: registry.menusFor("settings.company", ctx).map(toNav) });
  // Settings for the whole server (every business on it). Changed in the
  // app, not the Unraid template, so they need no restart.
  if (ctx.user.serverAdmin) sections.push({ id: "server", title: "Server", description: "You're the server admin.", items: SERVER_SETTINGS });
  return sections;
}

/** Settings pages this person pinned (Settings, the pin on each row), in the order they pinned them. */
function pinnedPages(ctx: AppContext): NavItem[] {
  const available = settingsSections(ctx).flatMap((section) => section.items);
  return ctx.user.pinned.flatMap((id) => {
    const item = available.find((entry) => entry.id === id);
    return item ? [{ id: item.id, label: item.label, href: item.href, icon: item.icon, activeFor: item.activeFor }] : [];
  });
}

export function AppShell({ ctx, children }: { ctx: AppContext; children: ReactNode }) {
  const items = registry.menusFor("sidebar.main", ctx);

  return (
    <ShellNav
      home={{ id: "core.home", label: "Home", href: "/", icon: "home" }}
      primary={items.filter((item) => item.prominence === "primary").map(toNav)}
      main={items.filter((item) => item.prominence === "main").map(toNav)}
      more={[
        ...items.filter((item) => !item.prominence).map(toNav),
        // Pinned settings pages (docs/navigation.md §5): sidebar on desktop, More on phones and tablets.
        ...pinnedPages(ctx),
        { id: "core.settings", label: "Settings", href: "/settings", icon: "settings" },
      ]}
      scan={centreButton(ctx)}
      headerActions={registry.menusFor("header.actions", ctx).map(toNav)}
      account={[...registry.menusFor("settings.user", ctx).map(toNav), SECURITY]}
      // Every page reached from Settings, for its "Settings › …" breadcrumb.
      settings={settingsPages(ctx)}
      user={ctx.user}
      company={ctx.company}
      look={ctx.user.look}
    >
      {children}
    </ShellNav>
  );
}
