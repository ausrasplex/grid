"use client";

// The bottom of Business details (docs/roadmap.md "Deleting a business"):
//   Leave this business   anyone but the last Owner (hidden while solo)
//   Delete business       Owners (companies.business.delete): shows what goes
//                         with it, then type the name to confirm. Restorable
//                         from the business picker until the clean-up
//                         removes it for good.

import { useState } from "react";
import { LogOut, Trash2 } from "lucide-react";
import { Alert, Button, Field, Loading, Section, Sheet, SheetContent, Stack, api, useAction, useApi } from "@grid/ui";

interface Summary {
  name: string;
  usage: { count: number; words: string }[];
  days: number;
}

export function DeleteBusiness({ canDelete, solo }: { canDelete: boolean; solo: boolean }) {
  const [deleting, setDeleting] = useState(false);
  const leave = useAction();

  if (!canDelete && solo) return null;

  return (
    <Stack>
      {!solo && (
        <Section title="Leave this business" description="You'll lose access to its jobs, quotes and plans. Your account and your Wallet stay yours.">
          <Alert variant="error">{leave.error}</Alert>
          <div>
            <Button
              variant="outline"
              disabled={leave.busy}
              onClick={() => {
                if (!confirm("Leave this business? An Owner would have to invite you again.")) return;
                void leave.run(async () => {
                  await api("/companies/current/leave", { method: "POST" });
                  window.location.href = "/";
                });
              }}
            >
              <LogOut aria-hidden />
              {leave.busy ? "Leaving…" : "Leave this business"}
            </Button>
          </div>
        </Section>
      )}
      {canDelete && (
        <Section title="Delete business" description="Removes it for everyone in it. You can restore it for a while from the business picker, then it's removed for good.">
          <div>
            <Button variant="outline" className="border-destructive/50 text-destructive hover:bg-destructive/10" onClick={() => setDeleting(true)}>
              <Trash2 aria-hidden />
              Delete business
            </Button>
          </div>
        </Section>
      )}
      <Sheet open={deleting} onOpenChange={setDeleting}>
        {deleting && <DeleteSheet />}
      </Sheet>
    </Stack>
  );
}

function DeleteSheet() {
  const summary = useApi<Summary>("/companies/current/delete");
  const action = useAction();
  const [typed, setTyped] = useState("");
  const data = summary.data;
  const matches = !!data && typed.trim().toLowerCase() === data.name.trim().toLowerCase();

  return (
    <SheetContent desktop="dialog" title={data ? `Delete ${data.name}?` : "Delete business?"}>
      {!data ? (
        summary.error ? <Alert variant="error">{summary.error}</Alert> : <Loading rows={2} />
      ) : (
        <form
          className="flex flex-col gap-4 px-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!matches) return;
            void action.run(async () => {
              await api("/companies/current/delete", { body: { name: typed } });
              // Grid opens your next business, or setup if this was your only one.
              window.location.href = "/";
            });
          }}
        >
          <div className="flex flex-col gap-2 text-sm">
            {data.usage.length > 0 && (
              <p>
                It has <strong>{data.usage.map((entry) => entry.words).join(", ")}</strong>.
              </p>
            )}
            <p className="text-muted-foreground">
              Everyone loses access straight away and it leaves their business picker. You and the other Owners can restore it for {data.days} days; after that
              it&apos;s removed for good, with its files. People&apos;s accounts, Wallets and other businesses aren&apos;t touched.
            </p>
          </div>
          <Field
            label={`Type ${data.name} to confirm`}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
          />
          <Alert variant="error">{action.error}</Alert>
          <Button type="submit" variant="destructive" size="lg" disabled={!matches || action.busy}>
            <Trash2 aria-hidden />
            {action.busy ? "Deleting…" : "Delete business"}
          </Button>
        </form>
      )}
    </SheetContent>
  );
}
