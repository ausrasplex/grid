"use client";

// The Change buttons on a client's and a business's page: the form in a
// dialog, then the page reloads with the new details. Removing goes back to
// the list. A business page also adds people at the business.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { Button, Icon, Sheet, SheetContent, api } from "@grid/ui";
import { BusinessForm, ClientForm, type BusinessRowJson, type ClientJson } from "./ClientPicker";

export function ClientActions({ client }: { client: ClientJson }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Icon name="edit" /> Change
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent desktop="dialog" title={client.name}>
          <ClientForm
            initial={client}
            onSaved={() => {
              setOpen(false);
              router.refresh();
            }}
            onDelete={async () => {
              if (!window.confirm(`Remove ${client.name}? Jobs and quotes that name them keep their details.`)) return;
              await api(`/clients/${client.id}`, { method: "DELETE" });
              window.location.href = "/clients";
            }}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}

export function BusinessActions({ business, canManage, canAdd }: { business: BusinessRowJson; canManage: boolean; canAdd: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState<"change" | "person" | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      {canAdd && (
        <Button variant="outline" onClick={() => setOpen("person")}>
          <UserPlus /> Add a person
        </Button>
      )}
      {canManage && (
        <Button variant="outline" onClick={() => setOpen("change")}>
          <Icon name="edit" /> Change
        </Button>
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
                onDelete={async () => {
                  if (!window.confirm(`Remove ${business.name}?`)) return;
                  try {
                    await api(`/clients/businesses/${business.id}`, { method: "DELETE" });
                    window.location.href = "/clients";
                  } catch (failure) {
                    setError(failure instanceof Error ? failure.message : String(failure));
                  }
                }}
              />
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
