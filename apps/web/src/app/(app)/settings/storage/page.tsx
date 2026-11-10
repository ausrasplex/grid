// Settings › Storage: Recently deleted, unfiled uploads, the clean-up
// history, and (server admin) space used and the clean-up settings.
import { redirect } from "next/navigation";
import { Alert, PageHeader, Stack } from "@grid/ui";
import { getStorageSettings } from "@grid/db";
import { renderPanels } from "@/blocks";
import { getContext } from "@/lib/context";
import { History } from "@/components/storage/History";
import { ServerStorage } from "@/components/storage/ServerStorage";
import { UnfiledList } from "@/components/storage/UnfiledList";

export const metadata = { title: "Storage · Grid" };

export default async function StoragePage() {
  const ctx = await getContext();
  if (!ctx) redirect("/sign-in");
  const manager = !!ctx.companyId && ctx.permissions.has("companies.storage.manage");
  const admin = ctx.user.serverAdmin;
  if (!manager && !admin) return <Alert variant="error">Only Owners and Foremen can manage storage.</Alert>;

  const settings = await getStorageSettings();
  const deleted = manager ? await renderPanels(ctx, "storage.deleted", {}) : [];
  return (
    <>
      <PageHeader title="Storage" subtitle="Deleted and unfiled photos, and what the clean-up has removed." />
      <Stack>
        {settings.mode !== "on" && (
          <Alert>
            {settings.mode === "off"
              ? "The automatic clean-up is switched off, so nothing is removed on its own."
              : "The clean-up is in dry-run mode: the history lists what would go, but nothing is removed."}
          </Alert>
        )}
        {deleted}
        {manager && <UnfiledList days={settings.unfiledDays} />}
        <History serverAdmin={admin} />
        {admin && (
          <>
            <h2 className="mt-4 px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Server (you're the server admin)</h2>
            <ServerStorage initial={settings} />
          </>
        )}
      </Stack>
    </>
  );
}
