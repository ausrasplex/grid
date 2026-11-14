// A join link (/join/<token>) from a business: sent by hand (text, WhatsApp)
// when the server has no email. Works before the person has signed in.
import { inviteByLink } from "@grid/block-companies";
import { db } from "@grid/db";
import { JoinForm } from "@/components/auth/JoinForm";
import { getSessionUserId } from "@/lib/session";

export const metadata = { title: "Join a business · Grid" };

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await inviteByLink(token);
  if (!invite) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold">This link has run out</h1>
        <p className="text-muted-foreground">The invite link has expired or was already used. Ask whoever sent it for a new one.</p>
        <a href="/sign-in" className="font-semibold text-primary underline">
          Sign in instead
        </a>
      </div>
    );
  }
  const userId = await getSessionUserId();
  const signedInAs = userId ? await db.user.findUnique({ where: { id: userId }, select: { id: true, email: true } }) : null;
  const credential = await db.account.findFirst({ where: { userId: invite.userId, providerId: "credential" }, select: { password: true } });
  // Already in another business here: sign in first (the link alone can't set their password).
  const elsewhere = await db.membership.count({ where: { userId: invite.userId, status: "ACTIVE" } });
  return (
    <JoinForm
      token={token}
      invite={{ companyName: invite.companyName, roleName: invite.roleName, email: invite.email, name: invite.name, invitedBy: invite.invitedBy }}
      signedIn={signedInAs ? { email: signedInAs.email, isInvitee: signedInAs.id === invite.userId } : null}
      mustSignIn={!!credential?.password || elsewhere > 0}
    />
  );
}
