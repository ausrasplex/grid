import { redirect } from "next/navigation";
import { Alert, PageHeader } from "@grid/ui";
import { getRenderingSettings } from "@grid/db";
import { getContext } from "@/lib/context";
import { hasJob } from "@/lib/jobs";
import { RenderingSettingsForm } from "@/components/settings/RenderingSettingsForm";

export const metadata = { title: "Plans & PDFs · Grid" };

export default async function PlansPdfsSettingsPage() {
  const ctx = await getContext();
  if (!ctx) redirect("/sign-in");
  if (!ctx.user.serverAdmin) return <Alert variant="error">Only the server admin can change how plans and PDFs are drawn.</Alert>;
  const { updatedAt: _updatedAt, ...levels } = await getRenderingSettings();
  const available = { plans: await hasJob("plans.rerender"), documents: await hasJob("documents.rerender") };
  return (
    <>
      <PageHeader title="Plans & PDFs" subtitle="How sharp Grid draws plans, documents and quote PDFs, for everyone on this server. Sharper zooms in further but takes this server longer and uses more disk." />
      <RenderingSettingsForm initial={levels} available={available} />
    </>
  );
}
