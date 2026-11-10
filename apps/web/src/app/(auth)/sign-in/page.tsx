import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/session";
import { serverHasAccounts, signUpOpen } from "@/lib/auth";
import { signInLinksAvailable } from "@/lib/mail";
import { SignInForm } from "@/components/auth/SignInForm";

export const metadata = { title: "Sign in · Grid" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next: nextParam } = await searchParams;
  // Only same-site paths, so a crafted link can't bounce someone elsewhere.
  const next = nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/";
  if (await getSessionUserId()) redirect(next);
  const firstAccount = !(await serverHasAccounts());
  return (
    <SignInForm
      firstAccount={firstAccount}
      canSignUp={await signUpOpen()}
      linksAvailable={await signInLinksAvailable()}
      next={next}
      linkError={
        !error
          ? null
          : error === "new_user_signup_disabled"
            ? "There's no account with that email yet. Ask the business you work with to invite you."
            : "That sign-in link has expired or was already used. Ask for a new one."
      }
    />
  );
}
