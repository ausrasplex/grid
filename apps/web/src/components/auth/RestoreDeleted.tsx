"use client";

// Setup, for someone whose only business was deleted: bring it back instead
// of starting again (docs/roadmap.md "Deleting a business").

import { Alert, Button, Section, api, useAction } from "@grid/ui";

export interface DeletedBusiness {
  id: string;
  name: string;
  removedOn: string;
}

const daysUntil = (value: string) => Math.max(0, Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000));

export function RestoreDeleted({ businesses }: { businesses: DeletedBusiness[] }) {
  const action = useAction();
  if (!businesses.length) return null;
  return (
    <Section title="Bring back a deleted business?" description="You deleted these. Restore one to carry on where you left off, or set up a new business below.">
      <div className="flex flex-col gap-3">
        <Alert variant="error">{action.error}</Alert>
        {businesses.map((business) => (
          <div key={business.id} className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold">{business.name}</p>
              <p className="text-sm text-muted-foreground">
                Removed for good in {daysUntil(business.removedOn)} day{daysUntil(business.removedOn) === 1 ? "" : "s"}
              </p>
            </div>
            <Button
              variant="outline"
              disabled={action.busy}
              onClick={() =>
                void action.run(async () => {
                  await api(`/companies/deleted/${business.id}/restore`, { method: "POST" });
                  await api("/session/company", { body: { companyId: business.id } });
                  window.location.href = "/";
                })
              }
            >
              Restore
            </Button>
          </div>
        ))}
      </div>
    </Section>
  );
}
