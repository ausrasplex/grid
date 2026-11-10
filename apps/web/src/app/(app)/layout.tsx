import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { hasAnyMembership } from "@grid/block-companies";
import { getContext } from "@/lib/context";
import { AppShell } from "@/components/AppShell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await getContext();
  if (!ctx) redirect("/sign-in");
  // Brand-new account with no business and no invites: straight to setup.
  if (!ctx.company && !(await hasAnyMembership(ctx.userId))) redirect("/setup");
  return <AppShell ctx={ctx}>{children}</AppShell>;
}
