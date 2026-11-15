import { Alert, PageHeader } from "@grid/ui";
import { db } from "@grid/db";
import { getContext } from "@/lib/context";
import { settingsSections } from "@/components/AppShell";
import { SettingsSections } from "@/components/settings/SettingsSections";

export default async function SettingsPage() {
  const ctx = (await getContext())!;
  // The server admin hears about a failed backup here, not just in the log.
  const lastBackup = ctx.user.serverAdmin ? await db.backupRun.findFirst({ where: { trigger: "schedule" }, orderBy: { startedAt: "desc" } }) : null;

  return (
    <>
      <PageHeader title="Settings" subtitle="Tap the pin on any page to add it to your menu." />
      {lastBackup?.status === "failed" && (
        <div className="mb-4">
          <Alert variant="error">
            The last scheduled backup failed: {lastBackup.error}{" "}
            <a href="/settings/backups" className="font-semibold underline">Open Backups</a>
          </Alert>
        </div>
      )}
      <SettingsSections sections={settingsSections(ctx)} pinned={ctx.user.pinned} />
    </>
  );
}
