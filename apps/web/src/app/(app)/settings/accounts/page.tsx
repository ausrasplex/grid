import { redirect } from "next/navigation";
import { Alert, PageHeader } from "@grid/ui";
import { getContext } from "@/lib/context";
import { AccountsDevices } from "@/components/settings/AccountsDevices";

export const metadata = { title: "Accounts & devices · Grid" };

export default async function AccountsPage() {
  const ctx = await getContext();
  if (!ctx) redirect("/sign-in");
  if (!ctx.user.serverAdmin) return <Alert variant="error">Only the server admin can see every account.</Alert>;
  return (
    <>
      <PageHeader title="Accounts & devices" subtitle="Everyone with an account on this server, and where they're signed in." />
      <AccountsDevices />
    </>
  );
}
