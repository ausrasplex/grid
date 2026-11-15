import { redirect } from "next/navigation";
import { Alert, PageHeader, Stack } from "@grid/ui";
import { getContext } from "@/lib/context";
import { AccountsDevices } from "@/components/settings/AccountsDevices";
import { ServerBusinesses } from "@/components/settings/ServerBusinesses";

export const metadata = { title: "Accounts & devices · Grid" };

export default async function AccountsPage() {
  const ctx = await getContext();
  if (!ctx) redirect("/sign-in");
  if (!ctx.user.serverAdmin) return <Alert variant="error">Only the server admin can see every account.</Alert>;
  return (
    <>
      <PageHeader title="Accounts & devices" subtitle="Everyone with an account on this server, where they're signed in, and every business." />
      <Stack>
        <AccountsDevices />
        <ServerBusinesses />
      </Stack>
    </>
  );
}
