// Quick routes: /go/<code> from a QR code or short link (docs/navigation.md §7).
// A link only routes. The page it opens still checks access.
import { redirect } from "next/navigation";
import { Button, Section } from "@grid/ui";
import { db, findRouteCode } from "@grid/db";
import { registry } from "@/blocks";
import { getSessionUserId } from "@/lib/session";

export const metadata = { title: "Open link · Grid" };

export default async function GoPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!(await getSessionUserId())) redirect(`/sign-in?next=${encodeURIComponent(`/go/${code}`)}`);

  const row = await findRouteCode(db, code);
  const target = row ? registry.routeTarget(row.entityType, row.entityId) : null;
  if (target) redirect(target);

  return (
    <Section title="That code isn't recognised">
      <div className="flex flex-col gap-4">
        <p className="text-muted-foreground">
          It may have been replaced with a new one, switched off, or belong to a different server. Check the code, or ask whoever gave it to you.
        </p>
        <Button asChild size="lg">
          <a href="/">Go to Home</a>
        </Button>
      </div>
    </Section>
  );
}
