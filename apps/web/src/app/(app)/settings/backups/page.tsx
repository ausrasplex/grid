import { redirect } from "next/navigation";
import { Alert, PageHeader } from "@grid/ui";
import { getBackupSettings } from "@grid/db";
import { getContext } from "@/lib/context";
import { Backups } from "@/components/settings/Backups";

export const metadata = { title: "Backups · Grid" };

export default async function BackupsPage() {
  const ctx = await getContext();
  if (!ctx) redirect("/sign-in");
  if (!ctx.user.serverAdmin) return <Alert variant="error">Only the server admin can manage backups.</Alert>;
  return (
    <>
      <PageHeader title="Backups" subtitle="Copies of the database and photos, kept on the backups share. To restore one, run the restore script in the Unraid terminal (see the Unraid guide)." />
      <Backups initial={await getBackupSettings()} />
    </>
  );
}
