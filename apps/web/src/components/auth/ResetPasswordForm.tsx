"use client";

import { useState } from "react";
import { Alert, Button, Field, Section } from "@grid/ui";
import { authClient } from "@/lib/auth-client";

export function ResetPasswordForm({ token }: { token: string | null }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <Section title="That link has expired">
        <div className="flex flex-col gap-4">
          <p className="text-muted-foreground">Reset links work once and expire after an hour. Ask for a new one from the sign-in screen.</p>
          <Button asChild size="lg">
            <a href="/sign-in">Back to sign in</a>
          </Button>
        </div>
      </Section>
    );
  }

  if (done) {
    return (
      <Section title="Password changed">
        <div className="flex flex-col gap-4">
          <Alert variant="success">You're all set. Other devices have been signed out.</Alert>
          <Button asChild size="lg">
            <a href="/sign-in">Sign in</a>
          </Button>
        </div>
      </Section>
    );
  }

  return (
    <Section title="Choose a new password">
      <form
        className="flex flex-col gap-4"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError(null);
          const { error } = await authClient.resetPassword({ newPassword: password, token });
          setBusy(false);
          if (error) setError(error.message || "Couldn't change the password. The link may have expired.");
          else setDone(true);
        }}
      >
        <Field
          label="New password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          hint="At least 8 characters."
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        <Alert variant="error">{error}</Alert>
        <Button type="submit" size="lg" disabled={busy}>
          {busy ? "Saving…" : "Save password"}
        </Button>
      </form>
    </Section>
  );
}
