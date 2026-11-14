import { redirect } from "next/navigation";
import { Alert, PageHeader } from "@grid/ui";
import { getMapsSettings } from "@grid/db";
import { getContext } from "@/lib/context";
import { MapsSettingsForm } from "@/components/settings/MapsSettingsForm";

export const metadata = { title: "Maps · Grid" };

export default async function MapsSettingsPage() {
  const ctx = await getContext();
  if (!ctx) redirect("/sign-in");
  if (!ctx.user.serverAdmin) return <Alert variant="error">Only the server admin can change maps settings.</Alert>;
  const { apiKeyEnc, updatedAt: _u, ...settings } = await getMapsSettings();
  return (
    <>
      <PageHeader title="Maps" subtitle="Address suggestions from Google Maps, for everyone on this server." />
      <MapsSettingsForm initial={{ ...settings, hasKey: !!apiKeyEnc }} />
    </>
  );
}
