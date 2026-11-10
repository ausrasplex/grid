"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Field, FormActions, Loading, Section, SelectField, api, useAction, useApi } from "@grid/ui";
import { TRADE_PROFILES } from "../presets";

const tradeOptions = TRADE_PROFILES.map((profile) => ({
  value: profile,
  label: profile === "CONTROLS_BMS" ? "Controls / BMS" : profile.charAt(0) + profile.slice(1).toLowerCase(),
}));

interface Company {
  id: string;
  name: string;
  abn: string | null;
  tradeProfile: string;
}

/** mode "create": new company. mode "edit": the active company. */
export function CompanyForm({ mode, canEdit = true }: { mode: "create" | "edit"; canEdit?: boolean }) {
  const current = useApi<Company>(mode === "edit" ? "/companies/current" : null);
  const save = useAction();
  const [name, setName] = useState("");
  const [abn, setAbn] = useState("");
  const [trade, setTrade] = useState<string>("ELECTRICAL");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (mode === "edit" && current.data) {
      setName(current.data.name);
      setAbn(current.data.abn ?? "");
      setTrade(current.data.tradeProfile);
    }
  }, [mode, current.data]);

  if (mode === "edit" && current.loading) return <Loading />;
  if (mode === "edit" && current.error) return <Alert variant="error">{current.error}</Alert>;

  return (
    <Section>
      <form
        className="flex flex-col gap-4"
        onSubmit={async (event) => {
          event.preventDefault();
          setSaved(false);
          const body = { name, tradeProfile: trade, ...(abn.trim() ? { abn } : mode === "edit" ? { abn: null } : {}) };
          if (mode === "create") {
            const created = await save.run(() => api<{ id: string }>("/companies", { body }));
            if (created) {
              await api("/session/company", { body: { companyId: created.id } });
              window.location.href = "/";
            }
          } else {
            const ok = await save.run(() => api("/companies/current", { method: "PATCH", body }));
            if (ok) setSaved(true);
          }
        }}
      >
        <Field
          label="Company name"
          autoComplete="organization"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          disabled={!canEdit}
        />
        <Field
          label="ABN"
          inputMode="numeric"
          placeholder="11 digits"
          value={abn}
          onChange={(event) => setAbn(event.target.value)}
          disabled={!canEdit}
        />
        <SelectField
          label="Trade"
          value={trade}
          onChange={(event) => setTrade(event.target.value)}
          options={tradeOptions}
          disabled={!canEdit}
          hint={
            mode === "create"
              ? "Sets which blocks start switched on and which markup icons you get. You can change everything later."
              : undefined
          }
        />
        <Alert variant="error">{save.error}</Alert>
        {saved && <Alert variant="success">Saved</Alert>}
        {canEdit && (
          <FormActions>
            <Button type="submit" size="lg" disabled={save.busy}>
              {save.busy ? "Saving…" : mode === "create" ? "Create company" : "Save"}
            </Button>
          </FormActions>
        )}
      </form>
    </Section>
  );
}
