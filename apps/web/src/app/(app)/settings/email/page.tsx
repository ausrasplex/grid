import { redirect } from "next/navigation";
import { Alert, PageHeader } from "@grid/ui";
import { getEmailSettings } from "@grid/db";
import { getContext } from "@/lib/context";
import { EmailSettingsForm } from "@/components/settings/EmailSettingsForm";

export const metadata = { title: "Email · Grid" };

export default async function EmailSettingsPage() {
  const ctx = await getContext();
  if (!ctx) redirect("/sign-in");
  if (!ctx.user.serverAdmin) return <Alert variant="error">Only the server admin can change the email server.</Alert>;
  const { passwordEnc, updatedAt: _u, ...settings } = await getEmailSettings();
  return (
    <>
      <PageHeader
        title="Email"
        subtitle="The email server Grid uses for sign-in links and password resets. Change provider any time: fill in the new details, send a test, save."
      />
      <EmailSettingsForm initial={{ ...settings, hasPassword: !!passwordEnc }} defaultTestTo={ctx.user.email} />
    </>
  );
}
