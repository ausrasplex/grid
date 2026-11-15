"use client";

// The client page's Change button: the client form in a dialog, then the
// page reloads with the new details. Removing goes back to the list.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Icon, Sheet, SheetContent, api } from "@grid/ui";
import { ClientForm, type ClientJson } from "./ClientPicker";

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
