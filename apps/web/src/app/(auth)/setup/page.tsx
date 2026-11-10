import { redirect } from "next/navigation";
import { getContext } from "@/lib/context";
import { SetupForm } from "@/components/auth/SetupForm";

export const metadata = { title: "Set up your business · Grid" };

// "Just me" setup (docs/roadmap.md, Phase 1). Also reachable from Home for
// someone who was invited somewhere but wants their own business too.
export default async function SetupPage() {
  const ctx = await getContext();
  if (!ctx) redirect("/sign-in");
  return <SetupForm userName={ctx.user.name} />;
}
