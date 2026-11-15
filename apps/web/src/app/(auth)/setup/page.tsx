import { redirect } from "next/navigation";
import { listMyDeletedCompanies } from "@grid/block-companies";
import { getContext } from "@/lib/context";
import { SetupForm } from "@/components/auth/SetupForm";
import { RestoreDeleted } from "@/components/auth/RestoreDeleted";

export const metadata = { title: "Set up your business · Grid" };

// "Just me" setup (docs/roadmap.md, Phase 1). Also reachable from Home for
// someone who was invited somewhere but wants their own business too.
// Someone who deleted their only business can restore it from here.
export default async function SetupPage() {
  const ctx = await getContext();
  if (!ctx) redirect("/sign-in");
  const deleted = await listMyDeletedCompanies(ctx.userId);
  return (
    <div className="flex flex-col gap-6">
      <RestoreDeleted businesses={deleted.map((business) => ({ id: business.id, name: business.name, removedOn: business.removedOn.toISOString() }))} />
      <SetupForm userName={ctx.user.name} />
    </div>
  );
}
