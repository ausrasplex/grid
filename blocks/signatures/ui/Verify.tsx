"use client";

// /verify/<code>: does a code match a signed document, and is this file
// the exact copy that was signed? Shows only yes/no and the date.
import { useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { Button, Field, api } from "@grid/ui";

const when = (date: string) => new Date(date).toLocaleString("en-AU", { day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit" });

export function Verify({ initialCode, lookup }: { initialCode: string; lookup: { found: boolean; signedAt?: string } | null }) {
  const [code, setCode] = useState(initialCode);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<{ found: boolean; match: boolean; signedAt?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-bold">Check a signed document</h1>
        <p className="mt-1 text-muted-foreground">Enter the verify code from the last page of the PDF, then choose the PDF to confirm it is the copy that was signed.</p>
      </div>
      {!initialCode ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (code.trim()) window.location.href = `/verify/${encodeURIComponent(code.trim())}`;
          }}
        >
          <Field label="Verify code" placeholder="ABCD-2345" value={code} onChange={(event) => setCode(event.target.value)} autoCapitalize="characters" required />
          <Button type="submit">Check</Button>
        </form>
      ) : lookup?.found ? (
        <div className="flex items-start gap-3 rounded-xl border border-success/40 bg-success/10 p-4">
          <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-success" />
          <div>
            <p className="font-semibold">Code {initialCode} matches a document signed on {when(lookup.signedAt!)}.</p>
            <p className="text-sm text-muted-foreground">To be sure your copy hasn't been changed, check the file below.</p>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4">
          <XCircle className="mt-0.5 size-6 shrink-0 text-destructive" />
          <p className="font-semibold">No signed document has the code {initialCode}. Check it against the last page of the PDF.</p>
        </div>
      )}

      {initialCode && lookup?.found && (
        <form
          className="flex flex-col gap-3"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!file) return;
            setBusy(true);
            setError(null);
            try {
              const response = await fetch(`/api/public/signatures/verify/${encodeURIComponent(initialCode)}`, { method: "POST", headers: { "content-type": "application/pdf" }, body: file });
              const data = await response.json();
              if (!response.ok) throw new Error(data?.error?.message ?? "Couldn't check that file");
              setResult(data);
            } catch (error) {
              setError((error as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="flex flex-col gap-2">
            <span className="font-medium">The PDF to check</span>
            <input type="file" accept="application/pdf,.pdf" onChange={(event) => (setFile(event.target.files?.[0] ?? null), setResult(null))} className="text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-card file:px-3 file:py-2 file:font-semibold" />
            <span className="text-sm text-muted-foreground">The file is only compared, not kept.</span>
          </label>
          <Button type="submit" disabled={!file || busy}>
            {busy ? "Checking…" : "Check this file"}
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {result &&
            (result.match ? (
              <div className="flex items-start gap-3 rounded-xl border border-success/40 bg-success/10 p-4">
                <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-success" />
                <p className="font-semibold">This is the exact file that was signed. It hasn&apos;t been changed.</p>
              </div>
            ) : (
              <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4">
                <XCircle className="mt-0.5 size-6 shrink-0 text-destructive" />
                <p className="font-semibold">This file is not the signed copy. It may have been changed, or it&apos;s a different document.</p>
              </div>
            ))}
        </form>
      )}
      <p className="mt-auto text-center text-xs text-muted-foreground">Checked by Grid</p>
    </main>
  );
}
