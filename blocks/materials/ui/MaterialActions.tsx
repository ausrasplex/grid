"use client";

// The material page's buttons: Change (opens the sheet).
import { useState } from "react";
import { Pencil } from "lucide-react";
import { ActionButton } from "@grid/ui";
import { MaterialSheet } from "./MaterialSheet";
import type { MaterialJson } from "./shared";

export function MaterialActions({ material }: { material: MaterialJson }) {
  const [editing, setEditing] = useState(false);
  return (
    <>
      <ActionButton icon={<Pencil />} label="Change" onClick={() => setEditing(true)} />
      {editing && (
        <MaterialSheet
          material={material}
          onClose={() => setEditing(false)}
          onSaved={(saved) => {
            setEditing(false);
            window.location.href = saved.removed ? "/materials" : `/materials/${saved.id}`;
          }}
          onOpen={(existing) => (window.location.href = `/materials/${existing.id}`)}
        />
      )}
    </>
  );
}
