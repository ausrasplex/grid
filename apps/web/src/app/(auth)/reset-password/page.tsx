import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export const metadata = { title: "Choose a new password · Grid" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const { token, error } = await searchParams;
  return <ResetPasswordForm token={error ? null : (token ?? null)} />;
}
