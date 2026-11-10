"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { Alert, Button, Field, Section } from "@grid/ui";
import { authClient } from "@/lib/auth-client";

type Mode = "password" | "link" | "forgot" | "signup";

interface Props {
  /** Nobody can sign in yet: the first account looks after the server. */
  firstAccount: boolean;
  canSignUp: boolean;
  /** Email is set up (or development), so sign-in links and resets work. */
  linksAvailable: boolean;
  linkError: string | null;
  /** Where to go after signing in (e.g. back to a /go/<code> link). */
  next: string;
}

/** Turns Better Auth's error into something a person can act on. */
function message(error: { message?: string; status?: number } | null | undefined, fallback: string, linksAvailable = false) {
  if (!error) return fallback;
  if (error.status === 401)
    return linksAvailable
      ? "That email and password don't match. Check them, or use a sign-in link."
      : "That email and password don't match. Check them and try again.";
  if (error.status === 429) return "Too many tries. Wait a minute and try again.";
  return error.message || fallback;
}

export function SignInForm({ firstAccount, canSignUp, linksAvailable, linkError, next }: Props) {
  const [mode, setMode] = useState<Mode>(firstAccount ? "signup" : "password");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(linkError);
  const [sent, setSent] = useState<string | null>(null);

  const switchMode = (mode: Mode) => {
    setMode(mode);
    setError(null);
    setSent(null);
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "password") {
        const { error } = await authClient.signIn.email({ email, password, rememberMe: true });
        if (error) return setError(message(error, "Couldn't sign in", linksAvailable));
        window.location.href = next;
      } else if (mode === "signup") {
        const { error } = await authClient.signUp.email({ name, email, password });
        if (error) return setError(message(error, "Couldn't create the account"));
        window.location.href = "/setup";
      } else if (mode === "link") {
        const { error } = await authClient.signIn.magicLink({ email, callbackURL: next, errorCallbackURL: "/sign-in?error=link" });
        if (error) return setError(message(error, "Couldn't send the link"));
        setSent(`If ${email} has an account, a sign-in link is on its way. It works once and expires in 15 minutes.`);
      } else {
        const { error } = await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
        if (error) return setError(message(error, "Couldn't send the reset email"));
        setSent(`If ${email} has an account, we've emailed a link to choose a new password.`);
      }
    } finally {
      setBusy(false);
    }
  }

  const titles: Record<Mode, [string, string | undefined]> = {
    password: ["Sign in", undefined],
    link: ["Email me a sign-in link", "Handy on a phone on site: no password to type."],
    forgot: ["Forgot your password?", "We'll email you a link to choose a new one."],
    signup: firstAccount
      ? ["Create the first account", "This server is brand new. The first account looks after it and can invite everyone else."]
      : ["Create an account", undefined],
  };
  const [title, description] = titles[mode];

  const emailField = (
    <Field
      label="Email"
      type="email"
      inputMode="email"
      autoComplete="email"
      autoCapitalize="none"
      value={email}
      onChange={(event) => setEmail(event.target.value)}
      required
    />
  );

  const links: ReactNode[] = [];
  if (mode !== "password" && !firstAccount) links.push(<TextLink key="pw" onClick={() => switchMode("password")}>Sign in with a password</TextLink>);
  if (mode === "password" && linksAvailable) links.push(<TextLink key="link" onClick={() => switchMode("link")}>Email me a sign-in link instead</TextLink>);
  if (mode === "password" && linksAvailable) links.push(<TextLink key="forgot" onClick={() => switchMode("forgot")}>Forgot password?</TextLink>);
  if (mode !== "signup" && canSignUp) links.push(<TextLink key="signup" onClick={() => switchMode("signup")}>Create an account</TextLink>);

  return (
    <div className="flex flex-col gap-4">
      <Section title={title} description={description}>
        {sent ? (
          <div className="flex flex-col gap-4">
            <Alert variant="success">{sent}</Alert>
            <Button variant="outline" size="lg" onClick={() => switchMode(mode)}>
              Send another
            </Button>
          </div>
        ) : (
          <form className="flex flex-col gap-4" onSubmit={submit}>
            {mode === "signup" && (
              <Field label="Your name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required />
            )}
            {emailField}
            {(mode === "password" || mode === "signup") && (
              <Field
                label="Password"
                type="password"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                minLength={8}
                hint={mode === "signup" ? "At least 8 characters." : undefined}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            )}
            <Alert variant="error">{error}</Alert>
            <Button type="submit" size="lg" disabled={busy}>
              {busy
                ? "One moment…"
                : { password: "Sign in", signup: "Create account", link: "Send link", forgot: "Send reset link" }[mode]}
            </Button>
          </form>
        )}
      </Section>
      {links.length > 0 && <div className="flex flex-col items-center gap-3">{links}</div>}
      {mode === "password" && !canSignUp && (
        <p className="text-center text-sm text-muted-foreground">
          New here? This server is invite-only. Ask the business you work with to invite you.
        </p>
      )}
    </div>
  );
}

function TextLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="min-h-touch px-2 font-semibold text-primary underline-offset-4 hover:underline">
      {children}
    </button>
  );
}
