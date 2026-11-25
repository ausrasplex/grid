"use client";

// The Change buttons on a client's and a business's page: the form in a
// dialog, then the page reloads with the new details. Removing (Owners,
// clients.manage) goes back to the list. A business page also adds people
// at the business.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { ActionButton, Icon, Sheet, SheetContent, api } from "@grid/ui";
import { BusinessForm, ClientForm, type BusinessRowJson, type ClientJson } from "./ClientPicker";

export function ClientActions({ client, canRemove }: { client: ClientJson; canRemove: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <ActionButton variant="outline" icon={<Icon name="edit" />} label="Change" onClick={() => setOpen(true)} />
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent desktop="dialog" title={client.name}>
          <ClientForm
            initial={client}
            onSaved={() => {
              setOpen(false);
              router.refresh();
            }}
            onDelete={
              canRemove
                ? async () => {
                    if (!window.confirm(`Remove ${client.name}? Jobs and quotes that name them keep their details.`)) return;
                    await api(`/clients/${client.id}`, { method: "DELETE" });
                    window.location.href = "/clients";
                  }
                : undefined
            }
          />
        </SheetContent>
      </Sheet>
    </>
  );
}

export function BusinessActions({ business, canEdit, canRemove, canAdd }: { business: BusinessRowJson; canEdit: boolean; canRemove: boolean; canAdd: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState<"change" | "person" | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      {canAdd && (
        <ActionButton variant="outline" icon={<UserPlus />} label="Add a person" onClick={() => setOpen("person")} />
      )}
      {canEdit && (
        <ActionButton variant="outline" icon={<Icon name="edit" />} label="Change" onClick={() => setOpen("change")} />
      )}
      <Sheet open={!!open} onOpenChange={(next) => !next && (setOpen(null), setError(null))}>
        <SheetContent desktop="dialog" title={open === "person" ? `New person at ${business.name}` : business.name}>
          {open === "person" ? (
            <ClientForm
              initial={{ businessId: business.id, business }}
              onSaved={() => {
                setOpen(null);
                router.refresh();
              }}
            />
          ) : (
            <>
              {error && <p className="px-2 pb-2 text-sm text-destructive">{error}</p>}
              <BusinessForm
                initial={business}
                onSaved={() => {
                  setOpen(null);
                  router.refresh();
                }}
                onDelete={
                  canRemove
                    ? async () => {
                        if (!window.confirm(`Remove ${business.name}?`)) return;
                        try {
                          await api(`/clients/businesses/${business.id}`, { method: "DELETE" });
                          window.location.href = "/clients";
                        } catch (failure) {
                          setError(failure instanceof Error ? failure.message : String(failure));
                        }
                      }
                    : undefined
                }
              />
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
