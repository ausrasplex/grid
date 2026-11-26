"use client";

// Retire as lost (docs/assets-block.md §3a, Owner): off the active list for
// good, keeping its history and tag record so a later scan still finds it.
import { Archive } from "lucide-react";
import { Alert, Button, api, useAction } from "@grid/ui";

export function RetireLost({ assetId }: { assetId: string }) {
  const action = useAction();
  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="outline"
        className="self-start"
        disabled={action.busy}
        onClick={() => {
          if (!window.confirm("Retire it as lost? It comes off the list for good. Its history stays, and if it ever turns up, Recovered brings it back.")) return;
          void action.run(async () => (await api(`/assets/${assetId}/retire-lost`, { method: "POST" }), window.location.reload()));
        }}
      >
        <Archive /> Retire as lost
      </Button>
      <Alert variant="error">{action.error}</Alert>
    </div>
  );
}
