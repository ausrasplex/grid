"use client";

// "Just me" setup (docs/roadmap.md, Phase 1): one screen, then Home.
// Both choices create the same records; size only picks the starting
// Blocks and where you land.

import { useState, type ReactNode } from "react";
import { Alert, Button, Field, Icon, Section, api, cn, useAction } from "@grid/ui";

const TRADES: { value: string; label: string }[] = [
  { value: "ELECTRICAL", label: "Electrical" },
  { value: "CONTROLS_BMS", label: "Controls / BMS" },
  { value: "MECHANICAL", label: "Mechanical" },
  { value: "PLUMBING", label: "Plumbing" },
  { value: "FIRE", label: "Fire" },
  { value: "CARPENTRY", label: "Carpentry" },
  { value: "BUILDER", label: "Builder" },
  { value: "OTHER", label: "Something else" },
];

type Size = "solo" | "team";

export function SetupForm({ userName }: { userName: string }) {
  const [name, setName] = useState("");
  const [trade, setTrade] = useState("ELECTRICAL");
  const [size, setSize] = useState<Size>("solo");
  const action = useAction();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Set up your business</h1>
        <p className="mt-1 text-muted-foreground">Three quick things. You can change all of it later in Settings.</p>
      </div>
      <form
        className="flex flex-col gap-4"
        onSubmit={async (event) => {
          event.preventDefault();
          const body = { name: name.trim() || userName, tradeProfile: trade, size };
          const created = await action.run(() => api<{ id: string }>("/companies", { body }));
          if (!created) return;
          await api("/session/company", { body: { companyId: created.id } });
          window.location.href = size === "team" ? "/b/companies/members" : "/";
        }}
      >
        <Section>
          <Field
            label="Business name"
            autoComplete="organization"
            placeholder={userName}
            hint="Shown on your quotes. Leave it blank to use your own name. No ABN needed yet."
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Section>

        <Section title="Your trade" description="Picks which Blocks start on and the markup icons you get.">
          <div role="radiogroup" aria-label="Trade" className="grid grid-cols-2 gap-2">
            {TRADES.map((option) => (
              <Choice key={option.value} selected={trade === option.value} onSelect={() => setTrade(option.value)}>
                <span className="font-semibold">{option.label}</span>
              </Choice>
            ))}
          </div>
        </Section>

        <Section title="Who's working in it?">
          <div role="radiogroup" aria-label="Business size" className="grid gap-2 sm:grid-cols-2">
            <Choice selected={size === "solo"} onSelect={() => setSize("solo")} tall>
              <Icon name="user" className="size-6" />
              <span className="text-lg font-bold">Just me</span>
              <span className="text-sm text-muted-foreground">Keep it simple. Team screens stay hidden until you add someone.</span>
            </Choice>
            <Choice selected={size === "team"} onSelect={() => setSize("team")} tall>
              <Icon name="users" className="size-6" />
              <span className="text-lg font-bold">With a team</span>
              <span className="text-sm text-muted-foreground">Invite workers or office staff next, and give them roles.</span>
            </Choice>
          </div>
        </Section>

        <Alert variant="error">{action.error}</Alert>
        <Button type="submit" size="lg" disabled={action.busy}>
          {action.busy ? "Setting up…" : size === "solo" ? "Start using Grid" : "Next: invite your team"}
        </Button>
      </form>
    </div>
  );
}

function Choice({ selected, onSelect, tall, children }: { selected: boolean; onSelect: () => void; tall?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "relative flex min-h-touch items-center gap-2 rounded-lg border-2 bg-muted/40 px-3 py-2 text-left transition-colors",
        tall && "flex-col items-start gap-1 p-4",
        selected ? "border-primary bg-accent text-accent-foreground" : "border-transparent hover:bg-muted",
      )}
    >
      {children}
      {selected && <Icon name="check" className="absolute top-2 right-2 size-5 text-primary" />}
    </button>
  );
}
