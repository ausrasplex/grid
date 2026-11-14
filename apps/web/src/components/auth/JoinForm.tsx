"use client";

// Joining a business from a join link. New to Grid: your name and a
// password, and you're in. Already have a password: sign in, then accept.

import { useState } from "react";
import { Alert, Button, Field, api, useAction } from "@grid/ui";
import { authClient } from "@/lib/auth-client";

interface Props {
  token: string;
  invite: { companyName: string; roleName: string; email: string; name: string; invitedBy: string | null };
  /** Who's signed in on this device, if anyone. */
  signedIn: { email: string; isInvitee: boolean } | null;
  /** The invited person already uses Grid (a password, or another business): they sign in first. */
  mustSignIn: boolean;
}

export function JoinForm({ token, invite, signedIn, mustSignIn }: Props) {
  // The name defaults to the start of their email when the inviter didn't give one: start blank then.
  const [name, setName] = useState(invite.name === invite.email.split("@")[0] ? "" : invite.name);
  const [password, setPassword] = useState("");
  const action = useAction();
  const join = async (body: Record<string, string>) => {
    const ok = await action.run(() => api("/session/join", { body: { token, ...body } }));
    if (ok) window.location.href = "/";
  };

  const heading = (
    <div className="flex flex-col gap-1">
      <h1 className="text-2xl font-bold">Join {invite.companyName}</h1>
      <p className="text-muted-foreground">
        {invite.invitedBy ? `${invite.invitedBy} invited you` : "You've been invited"} as {invite.roleName}, using {invite.email}.
      </p>
    </div>
  );

  // Signed in as someone else on this device.
  if (signedIn && !signedIn.isInvitee) {
    return (
      <div className="flex flex-col gap-4">
        {heading}
        <Alert>
          You&apos;re signed in as {signedIn.email}. This invite is for {invite.email}. Sign out, then open the link again.
        </Alert>
        <Button
          size="lg"
          variant="outline"
          onClick={async () => {
            await authClient.signOut();
            window.location.reload();
          }}
        >
          Sign out
        </Button>
      </div>
    );
  }

  // Signed in as the invited person: one tap.
  if (signedIn) {
    return (
      <div className="flex flex-col gap-4">
        {heading}
        <Alert variant="error">{action.error}</Alert>
        <Button size="lg" disabled={action.busy} onClick={() => void join({})}>
          {action.busy ? "Joining…" : `Join ${invite.companyName}`}
        </Button>
      </div>
    );
  }

  // Already uses Grid: sign in first, then come back here.
  if (mustSignIn) {
    return (
      <div className="flex flex-col gap-4">
        {heading}
        <p>You already have a Grid account. Sign in, and you&apos;ll come straight back here to accept.</p>
        <Button asChild size="lg">
          <a href={`/sign-in?next=${encodeURIComponent(`/join/${token}`)}`}>Sign in to accept</a>
        </Button>
      </div>
    );
  }

  // New to Grid: name and password.
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void join({ name, password });
      }}
    >
      {heading}
      <Field label="Your name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required autoFocus />
      <Field label="Email" value={invite.email} disabled hint="You'll sign in with this." />
      <Field
        label="Choose a password"
        type="password"
        autoComplete="new-password"
        minLength={8}
        hint="At least 8 characters."
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        required
      />
      <Alert variant="error">{action.error}</Alert>
      <Button type="submit" size="lg" disabled={action.busy || !name.trim() || password.length < 8}>
        {action.busy ? "Joining…" : `Join ${invite.companyName}`}
      </Button>
    </form>
  );
}
