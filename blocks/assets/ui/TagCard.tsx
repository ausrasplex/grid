"use client";

// The QR tag on an asset's page: the code to scan, the code to type in
// when a camera won't read the sticker, and Print tag.
import { useState } from "react";
import { Printer } from "lucide-react";
import { Button, Section } from "@grid/ui";
import { PrintTagsSheet } from "./PrintTagsSheet";

export function TagCard({ assetId, number, tagCode, qr, canPrint }: { assetId: string; number: number; tagCode: string; qr: string | null; canPrint: boolean }) {
  const [printing, setPrinting] = useState(false);
  return (
    <Section title="Tag" description="Scan it with the Scan button, or any phone camera, to open this asset.">
      <div className="flex items-center gap-4">
        {qr && <div className="paper size-28 shrink-0 rounded-lg bg-white p-2 [&_svg]:size-full" aria-label={`QR tag for Asset No. ${number}`} role="img" dangerouslySetInnerHTML={{ __html: qr }} />}
        <div className="flex min-w-0 flex-col gap-2">
          <p className="font-mono text-sm font-semibold tracking-wide break-all">{tagCode}</p>
          <p className="text-sm text-muted-foreground">The code to type in when a camera won&apos;t read the sticker.</p>
          {canPrint && (
            <Button variant="outline" className="self-start" onClick={() => setPrinting(true)}>
              <Printer /> Print tag
            </Button>
          )}
        </div>
      </div>
      {printing && <PrintTagsSheet assetIds={[assetId]} onClose={() => setPrinting(false)} />}
    </Section>
  );
}
