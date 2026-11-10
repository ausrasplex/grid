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

const toNav = (item: MenuItem): NavItem => ({ id: item.id, label: item.label, href: item.href, icon: item.icon, activeFor: item.activeFor });

/**
 * The raised centre button (docs/navigation.md §5a).
 *  - Sole trader with the Photos block: Take a photo.
 *  - Otherwise: Scan.
 *  - Later (phases 7–8): an Actions menu (shell.quick) once checked in to a site.
 */
function centreButton(ctx: AppContext): NavItem {
  if (ctx.solo && ctx.enabledBlocks.has("photos")) {
    return { id: "core.photo", label: "Take a photo", href: "/b/photos/capture", icon: "camera" };
  }
  return { id: "core.scan", label: "Scan", href: "/scan", icon: "scan" };
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
        { id: "core.settings", label: "Settings", href: "/settings", icon: "settings" },
      ]}
      scan={centreButton(ctx)}
      headerActions={registry.menusFor("header.actions", ctx).map(toNav)}
      account={[...registry.menusFor("settings.user", ctx).map(toNav), SECURITY]}
      user={ctx.user}
      company={ctx.company}
    >
      {children}
    </ShellNav>
  );
}
