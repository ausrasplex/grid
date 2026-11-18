"use client";

// Settings › Plans & PDFs (server admin): a level per kind. New uploads use
// it straight away; "Draw existing ones again" redoes what's already there
// in the background. A plan sheet can also have its own level (Sheet details).

import { useState } from "react";
import { Alert, Button, FormActions, Section, Segmented, Stack, api, useAction } from "@grid/ui";
import {
  LEVEL_NAMES,
  PAGE_LEVELS,
  PAGE_LEVEL_DISK,
  PAGE_LEVEL_SIZES,
  PLAN_LEVELS,
  PLAN_LEVEL_DISK,
  PLAN_LEVEL_SIZES,
  type PageLevel,
  type PlanLevel,
} from "@grid/db/render-levels";

interface Levels {
  plans: PlanLevel;
  documents: PageLevel;
  quotes: PageLevel;
}
type Kind = "plans" | "documents";

export function RenderingSettingsForm({ initial, available }: { initial: Levels; available: Record<Kind, boolean> }) {
  const [saved, setSaved] = useState(initial);
  const [form, setForm] = useState(initial);
  const [done, setDone] = useState<string | null>(null);
  const save = useAction();
  const redraw = useAction();
  const changed = (Object.keys(form) as (keyof Levels)[]).filter((kind) => form[kind] !== saved[kind]);
  // What changed since the last save and can be drawn again.
  const [toRedraw, setToRedraw] = useState<Kind[]>([]);

  return (
    <Stack>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setDone(null);
          const result = await save.run(() => api<Levels>("/server/rendering", { method: "PUT", body: form }));
          if (!result) return;
          setToRedraw((current) => [...new Set([...current, ...changed.filter((kind): kind is Kind => kind !== "quotes" && available[kind as Kind])])]);
          setSaved({ plans: result.plans, documents: result.documents, quotes: result.quotes });
          setDone("Saved. New uploads use it from now on.");
        }}
      >
        <Stack>
          {available.plans && (
            <LevelSection
              title="Plans"
              description="Drawings are cut into tiles, so phones only load what's on screen: a higher level costs this server, not the phone. A single sheet can have its own level too (open it › Sheet details › Sharpness)."
              levels={PLAN_LEVELS}
              value={form.plans}
              onChange={(plans) => setForm({ ...form, plans })}
              detail={(level) => `${PLAN_LEVEL_SIZES[level].dpi} dpi, up to ${PLAN_LEVEL_SIZES[level].maxMegapixels} megapixels a sheet (bigger sheets are drawn a little softer). Uses ${PLAN_LEVEL_DISK[level]}.`}
            />
          )}
          {available.documents && (
            <LevelSection
              title="Documents"
              description="Manuals, data sheets and other PDFs in Documents. Each page is one picture the phone holds whole, so there's no Extreme."
              levels={PAGE_LEVELS}
              value={form.documents}
              onChange={(documents) => setForm({ ...form, documents })}
              detail={(level) => `${PAGE_LEVEL_SIZES[level].dpi} dpi, up to ${PAGE_LEVEL_SIZES[level].maxEdge} px on a page's long side. Uses ${PAGE_LEVEL_DISK[level]}.`}
            />
          )}
          <LevelSection
            title="Quote PDFs"
            description="Quote previews and sent quotes shown inside Grid. They're drawn again at the new level the next time each one is opened."
            levels={PAGE_LEVELS}
            value={form.quotes}
            onChange={(quotes) => setForm({ ...form, quotes })}
            detail={(level) => `${PAGE_LEVEL_SIZES[level].dpi} dpi, up to ${PAGE_LEVEL_SIZES[level].maxEdge} px on a page's long side.`}
          />
          <Alert variant="error">{save.error}</Alert>
          <Alert variant="success">{done}</Alert>
          <FormActions>
            <Button type="submit" size="lg" disabled={save.busy || !changed.length}>
              {save.busy ? "Saving…" : "Save"}
            </Button>
          </FormActions>
        </Stack>
      </form>

      {(available.plans || available.documents) && (
        <Section
          title="Draw existing ones again"
          description="Saving only changes new uploads. This redraws what's already here at the levels above, in the background: plans and documents stay viewable while it runs. Sheets with their own level are left alone. A big job set can take a while and add a lot to disk at High or Extreme."
        >
          <div className="flex flex-col gap-3">
            {toRedraw.length > 0 && <p className="text-sm">You changed {toRedraw.map((kind) => (kind === "plans" ? "Plans" : "Documents")).join(" and ")}. Draw the existing ones again to match?</p>}
            <div className="flex flex-wrap gap-2">
              {(["plans", "documents"] as const)
                .filter((kind) => available[kind])
                .map((kind) => (
                  <Button
                    key={kind}
                    variant={toRedraw.includes(kind) ? "default" : "outline"}
                    disabled={redraw.busy || changed.length > 0}
                    onClick={() =>
                      void redraw.run(async () => {
                        if (!window.confirm(`Draw every ${kind === "plans" ? "plan sheet" : "document"} again at ${LEVEL_NAMES[saved[kind]]}? It runs in the background.`)) return;
                        await api("/server/rendering", { method: "POST", body: { kinds: [kind] } });
                        setToRedraw((current) => current.filter((entry) => entry !== kind));
                        setDone(`Drawing ${kind === "plans" ? "plans" : "documents"} again in the background. They stay viewable meanwhile; each one switches over when it's done.`);
                      })
                    }
                  >
                    Redraw {kind === "plans" ? "plans" : "documents"}
                  </Button>
                ))}
            </div>
            {changed.length > 0 && <p className="text-sm text-muted-foreground">Save your changes first.</p>}
            <Alert variant="error">{redraw.error}</Alert>
          </div>
        </Section>
      )}
    </Stack>
  );
}

function LevelSection<T extends string>({
  title,
  description,
  levels,
  value,
  onChange,
  detail,
}: {
  title: string;
  description: string;
  levels: readonly T[];
  value: T;
  onChange: (value: T) => void;
  detail: (level: T) => string;
}) {
  return (
    <Section title={title} description={description}>
      <div className="flex flex-col gap-2">
        <Segmented label={`${title} level`} value={value} onChange={onChange} items={levels.map((level) => ({ value: level, label: LEVEL_NAMES[level as PlanLevel] }))} />
        <p className="text-sm text-muted-foreground">
          {detail(value)}
          {value === "MEDIUM" && " Grid's standard."}
        </p>
      </div>
    </Section>
  );
}
