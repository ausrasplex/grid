"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Field, FormActions, Loading, Section, api, useAction, useApi } from "@grid/ui";

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
        <Field label="Email" value={data.email} disabled hint="Your sign-in email. Ask an admin to change it." />
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
    </Section>
  );
}
