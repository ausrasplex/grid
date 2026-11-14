"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Field, FormActions, Loading, Section, Sheet, SheetContent, api, useAction, useApi } from "@grid/ui";

interface Me {
  id: string;
  email: string;
  name: string;
  phone: string | null;
}

export function ProfileForm() {
  const { data, error, loading } = useApi<Me>("/users/me");
  const save = useAction();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saved, setSaved] = useState(false);
  /** The email shown, once changed here. */
  const [email, setEmail] = useState<string | null>(null);
  const [changingEmail, setChangingEmail] = useState(false);

  useEffect(() => {
    if (data) {
      setName(data.name);
      setPhone(data.phone ?? "");
    }
  }, [data]);

  if (loading) return <Loading />;
  if (error || !data) return <Alert variant="error">{error ?? "Couldn't load your profile"}</Alert>;

  return (
    <Section>
      <form
        className="flex flex-col gap-4"
        onSubmit={async (event) => {
          event.preventDefault();
          setSaved(false);
          const ok = await save.run(() =>
            api("/users/me", { method: "PATCH", body: { name, phone: phone.trim() || null } }),
          );
          if (ok) setSaved(true);
        }}
      >
        <div className="flex flex-col gap-2 lg:max-w-2xl">
          <Field label="Email" value={email ?? data.email} disabled hint="Your sign-in email." />
          <Button type="button" variant="outline" className="self-start" onClick={() => setChangingEmail(true)}>
            Change email
          </Button>
        </div>
        <Field label="Name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} />
        <Field
          label="Mobile"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          maxLength={30}
        />
        <Alert variant="error">{save.error}</Alert>
        {saved && <Alert variant="success">Saved</Alert>}
        <FormActions>
          <Button type="submit" size="lg" disabled={save.busy}>
            {save.busy ? "Saving…" : "Save"}
          </Button>
        </FormActions>
      </form>
      <ChangeEmail
        open={changingEmail}
        onOpenChange={setChangingEmail}
        current={email ?? data.email}
        onChanged={(next) => {
          setEmail(next);
          setChangingEmail(false);
        }}
      />
    </Section>
  );
}

/** New email plus your current password (so a phone left signed in can't take the account). */
function ChangeEmail({ open, onOpenChange, current, onChanged }: { open: boolean; onOpenChange: (open: boolean) => void; current: string; onChanged: (email: string) => void }) {
  const [next, setNext] = useState("");
  const [password, setPassword] = useState("");
  const action = useAction();
  return (
    <Sheet
      open={open}
      onOpenChange={(value) => {
        onOpenChange(value);
        if (!value) (setNext(""), setPassword(""), action.setError(null));
      }}
    >
      <SheetContent title="Change your email" description={`You sign in with ${current} now.`}>
        <form
          className="flex flex-col gap-4 px-2"
          onSubmit={async (event) => {
            event.preventDefault();
            const result = await action.run(() => api<{ email: string }>("/session/email", { body: { email: next, password } }));
            if (result) {
              onChanged(result.email);
              setNext("");
              setPassword("");
            }
          }}
        >
          <Field label="New email" type="email" inputMode="email" autoComplete="email" value={next} onChange={(event) => setNext(event.target.value)} required autoFocus />
          <Field
            label="Your current password"
            type="password"
            autoComplete="current-password"
            hint="To check it's you."
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          <p className="text-sm text-muted-foreground">From now on you&apos;ll sign in with the new email. Your password stays the same, and we&apos;ll let your old address know.</p>
          <Alert variant="error">{action.error}</Alert>
          <FormActions>
            <Button type="button" variant="outline" size="lg" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" size="lg" disabled={action.busy || !next.trim() || !password}>
              {action.busy ? "Changing…" : "Change email"}
            </Button>
          </FormActions>
        </form>
      </SheetContent>
    </Sheet>
  );
}
