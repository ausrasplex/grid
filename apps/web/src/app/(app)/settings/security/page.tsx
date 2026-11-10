import { PageHeader } from "@grid/ui";
import { Security } from "@/components/auth/Security";

export const metadata = { title: "Sign-in & devices · Grid" };

export default function SecurityPage() {
  return (
    <>
      <PageHeader title="Sign-in & devices" subtitle="Your password, and the phones and computers you're signed in on." />
      <Security />
    </>
  );
}
