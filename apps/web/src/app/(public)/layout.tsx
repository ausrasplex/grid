// Pages for people who aren't signed in: a customer's quote link, the
// signed-PDF check. Light "paper" look, never indexed, and the address
// (which holds a private link) is never sent on to other sites.
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function PublicLayout({ children }: { children: ReactNode }) {
  return <div className="paper min-h-dvh bg-background text-foreground">{children}</div>;
}
