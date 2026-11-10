"use client";

// The customer's quote page (/q/<token>): read it on a phone, tick any
// extras, then accept and sign (after a code emailed to them) or decline.
import { useMemo, useRef, useState } from "react";
import { CheckCircle2, Download, Mail, Phone, XCircle } from "lucide-react";
import { Alert, Button, Checkbox, Field, Label } from "@grid/ui";
import { SignaturePad, type SignMethod } from "@grid/block-signatures/pad";
import { formatMoney, groupBySection } from "../money";
import { totalsFor, type QuoteSnapshot } from "../snapshot";

export interface CustomerViewJson {
  token: string;
  state: "open" | "signed" | "declined" | "withdrawn" | "replaced" | "expired";
  business: { name: string; logo: string | null; accent: string; phone: string | null; email: string };
  snapshot: QuoteSnapshot;
  revision: string;
  codeTo: string;
  verified: boolean;
  allowDrawn: boolean;
  allowTyped: boolean;
  signed: { name: string; at: string; verifyCode: string; chosen: number[] } | null;
  declined: { at: string } | null;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`/api/public/quotes${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error?.message ?? "Something went wrong. Try again.");
  return data as T;
}

const when = (date: string) => new Date(date).toLocaleString("en-AU", { day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit" });

export function CustomerQuote({ view }: { view: CustomerViewJson }) {
  const { snapshot, business } = view;
  const money = (cents: number) => formatMoney(cents, snapshot.tax.currency, snapshot.tax.locale);
  const open = view.state === "open";
  const [chosen, setChosen] = useState<number[]>(view.signed?.chosen ?? []);
  const totals = useMemo(() => totalsFor(snapshot, chosen), [snapshot, chosen]);
  const [mode, setMode] = useState<"idle" | "accept" | "decline">("idle");
  const panel = useRef<HTMLDivElement>(null);
  const indexed = snapshot.lines.map((line, index) => ({ ...line, index }));
  const main = indexed.filter((line) => !line.optional);
  const options = indexed.filter((line) => line.optional);
  const pdfHref = `/api/public/quotes/q/${view.token}/pdf`;
  const openPanel = (mode: "accept" | "decline") => {
    setMode(mode);
    setTimeout(() => panel.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  return (
    <div className="mx-auto w-full max-w-3xl pb-16">
      <header className="flex items-center gap-4 border-b-4 px-4 pt-6 pb-4 sm:px-6" style={{ borderColor: business.accent }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {business.logo && <img src={business.logo} alt="" className="max-h-14 max-w-32 object-contain" />}
        <div className="min-w-0">
          <p className="text-lg font-bold leading-tight">{business.name}</p>
          <p className="flex flex-wrap gap-x-3 text-sm text-muted-foreground">
            {business.phone && (
              <a href={`tel:${business.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1">
                <Phone className="size-3.5" /> {business.phone}
              </a>
            )}
            <a href={`mailto:${business.email}`} className="inline-flex items-center gap-1">
              <Mail className="size-3.5" /> {business.email}
            </a>
          </p>
        </div>
      </header>

      <main className="flex flex-col gap-5 px-4 pt-5 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold tracking-wide uppercase" style={{ color: business.accent }}>
              {snapshot.tax.documentTitle} {snapshot.number} · Rev {view.revision}
            </p>
            <h1 className="text-2xl font-bold sm:text-3xl">{snapshot.title}</h1>
            <p className="text-sm text-muted-foreground">
              {[snapshot.client?.name, snapshot.siteAddress].filter(Boolean).join(" · ")}
              <br />
              {snapshot.date} · Valid until {snapshot.validUntil}
            </p>
          </div>
          <Button variant="outline" asChild>
            <a href={view.state === "signed" ? `${pdfHref}?signed=1` : pdfHref} target="_blank" rel="noopener">
              <Download /> {view.state === "signed" ? "Signed PDF" : "PDF"}
            </a>
          </Button>
        </div>

        <StateBanner view={view} />

        {snapshot.intro && <p className="whitespace-pre-line">{snapshot.intro}</p>}

        <section className="overflow-hidden rounded-xl border bg-card">
          {snapshot.clientView === "ITEMISED" && <Lines rows={main} money={money} />}
          {snapshot.clientView === "SECTIONS" && (
            <ul className="divide-y">
              {[...main.reduce((total, line) => total.set(line.section || "Works", (total.get(line.section || "Works") ?? 0) + line.amountCents), new Map<string, number>())].map(([name, cents]) => (
                <li key={name} className="flex justify-between gap-3 px-4 py-3">
                  <span className="font-medium">{name}</span>
                  <span className="font-semibold tabular-nums">{money(cents)}</span>
                </li>
              ))}
            </ul>
          )}
          {snapshot.clientView === "LUMP" && (
            <ul className="list-disc space-y-1 py-3 pr-4 pl-9">
              {main.map((line) => (
                <li key={line.index} className="whitespace-pre-line">
                  {line.description}
                </li>
              ))}
            </ul>
          )}
        </section>

        {options.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="text-lg font-bold">Optional extras</h2>
            <p className="text-sm text-muted-foreground">{open ? "Tick any you'd like. They're added to the total." : "Extras chosen are ticked."}</p>
            <ul className="divide-y rounded-xl border bg-card">
              {options.map((option) => {
                const on = chosen.includes(option.index);
                return (
                  <li key={option.index}>
                    <label className="flex min-h-touch-lg cursor-pointer items-start gap-3 px-4 py-3">
                      <Checkbox
                        className="mt-0.5"
                        checked={on}
                        disabled={!open}
                        onCheckedChange={(checked) => setChosen((currentChosen) => (checked === true ? [...currentChosen, option.index] : currentChosen.filter((chosenIndex) => chosenIndex !== option.index)))}
                        aria-label={option.description}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium whitespace-pre-line">{option.description}</span>
                        <span className="block text-sm text-muted-foreground tabular-nums">
                          {option.qty} {option.unit} × {money(option.unitCents)}
                        </span>
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums">{money(option.amountCents)}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <dl className="ml-auto flex w-full max-w-sm flex-col gap-1 tabular-nums">
          {!snapshot.tax.pricesIncludeTax && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd>{money(totals.subtotalExCents)}</dd>
            </div>
          )}
          {totals.taxByCode
            .filter((code) => code.rate > 0)
            .map((code) => (
              <div key={code.id} className="flex justify-between">
                <dt className="text-muted-foreground">
                  {snapshot.tax.pricesIncludeTax ? "Includes " : ""}
                  {code.label} ({Math.round(code.rate * 1000) / 10}%)
                </dt>
                <dd>{money(code.taxCents)}</dd>
              </div>
            ))}
          <div className="flex justify-between border-t-2 pt-2 text-xl font-bold" style={{ borderColor: business.accent }}>
            <dt>Total incl. {snapshot.tax.taxName}</dt>
            <dd>{money(totals.totalCents)}</dd>
          </div>
        </dl>

        {snapshot.terms && (
          <section className="flex flex-col gap-1">
            <h2 className="text-lg font-bold">Terms</h2>
            <p className="text-sm whitespace-pre-line">{snapshot.terms}</p>
          </section>
        )}

        {open && mode === "idle" && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button size="lg" className="sm:flex-1" style={{ background: business.accent, color: "#fff" }} onClick={() => openPanel("accept")}>
              Accept and sign
            </Button>
            <Button size="lg" variant="outline" onClick={() => openPanel("decline")}>
              Decline
            </Button>
          </div>
        )}

        <div ref={panel} className="scroll-mt-4">
          {open && mode === "accept" && <AcceptPanel view={view} chosen={chosen} total={money(totals.totalCents)} onCancel={() => setMode("idle")} />}
          {open && mode === "decline" && <DeclinePanel view={view} onCancel={() => setMode("idle")} />}
        </div>
      </main>
    </div>
  );
}

function Lines({ rows, money }: { rows: (QuoteSnapshot["lines"][number] & { index: number })[]; money: (cents: number) => string }) {
  return (
    <ul>
      {groupBySection(rows).map((group, index) => (
        <li key={index}>
          {group.section && <div className="border-t bg-muted/60 px-4 pt-3 pb-1 text-xs font-bold tracking-wide text-muted-foreground uppercase first:border-t-0">{group.section}</div>}
          <ul className="divide-y">
            {group.items.map(({ line }) => (
              <li key={line.index} className="flex items-start justify-between gap-3 px-4 py-3">
                <span className="min-w-0">
                  <span className="block font-medium whitespace-pre-line">{line.description}</span>
                  <span className="block text-sm text-muted-foreground tabular-nums">
                    {line.qty} {line.unit} × {money(line.unitCents)}
                  </span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums">{money(line.amountCents)}</span>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

function StateBanner({ view }: { view: CustomerViewJson }) {
  const contact = `Contact ${view.business.name} on ${view.business.phone ?? view.business.email} if you have questions.`;
  if (view.state === "signed" && view.signed)
    return (
      <div className="flex items-start gap-3 rounded-xl border border-success/40 bg-success/10 p-4">
        <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-success" />
        <div>
          <p className="font-semibold">
            Accepted and signed by {view.signed.name} on {when(view.signed.at)}.
          </p>
          <p className="text-sm">
            A signed copy was emailed to you. Verify code <strong>{view.signed.verifyCode}</strong>.
          </p>
        </div>
      </div>
    );
  if (view.state === "declined")
    return (
      <div className="flex items-start gap-3 rounded-xl border p-4">
        <XCircle className="mt-0.5 size-6 shrink-0 text-muted-foreground" />
        <p>You declined this quote{view.declined ? ` on ${when(view.declined.at)}` : ""}. {contact}</p>
      </div>
    );
  if (view.state === "open") return null;
  const text =
    view.state === "withdrawn"
      ? "This quote has been withdrawn."
      : view.state === "replaced"
        ? "There's a newer version of this quote. Check your email for the latest link."
        : "This quote has passed its valid date.";
  return <Alert>{`${text} ${contact}`}</Alert>;
}

function AcceptPanel({ view, chosen, total, onCancel }: { view: CustomerViewJson; chosen: number[]; total: string; onCancel: () => void }) {
  const [verified, setVerified] = useState(view.verified);
  const [codeSent, setCodeSent] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState(view.snapshot.client?.contactName || view.snapshot.client?.name || "");
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [signature, setSignature] = useState<{ png: string; method: SignMethod } | null>(null);
  const [agreeE, setAgreeE] = useState(false);
  const [agreeQ, setAgreeQ] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (callback: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await callback();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const doc = view.snapshot.tax.documentTitle.toLowerCase();

  return (
    <section className="flex flex-col gap-5 rounded-xl border-2 bg-card p-4 sm:p-6" style={{ borderColor: view.business.accent }}>
      <h2 className="text-xl font-bold">Accept and sign</h2>

      <div className="flex flex-col gap-3">
        <h3 className="font-semibold">1. Confirm it&apos;s you</h3>
        {verified ? (
          <p className="flex items-center gap-2 text-sm text-success">
            <CheckCircle2 className="size-4" /> Email confirmed
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">We&apos;ll email a 6-digit code to {view.codeTo}, the address this {doc} was sent to.</p>
            {codeSent && (
              <form
                className="flex flex-col gap-3 sm:flex-row sm:items-end"
                onSubmit={(event) => {
                  event.preventDefault();
                  void run(async () => {
                    await post(`/q/${view.token}/verify`, { code });
                    setVerified(true);
                  });
                }}
              >
                <div className="sm:w-48">
                  <Field label="Code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} autoFocus />
                </div>
                <Button type="submit" disabled={busy || code.length !== 6}>
                  Confirm
                </Button>
              </form>
            )}
            <Button
              variant={codeSent ? "ghost" : "default"}
              className="self-start"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const result = await post<{ sentTo: string; minutes: number }>(`/q/${view.token}/code`, {});
                  setCodeSent(`Sent to ${result.sentTo}. It works for ${result.minutes} minutes.`);
                  setCode("");
                })
              }
            >
              {codeSent ? "Send another code" : "Email me a code"}
            </Button>
            {codeSent && <p className="text-sm text-muted-foreground">{codeSent}</p>}
          </>
        )}
      </div>

      {verified && (
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (!signature) return setError("Add your signature.");
            void run(async () => {
              await post(`/q/${view.token}/sign`, {
                signerName: name,
                signerTitle: title || null,
                signerCompany: company || null,
                method: signature.method,
                signature: signature.png,
                chosen,
                agreeElectronic: agreeE,
                agreeQuote: agreeQ,
              });
              window.location.reload();
            });
          }}
        >
          <div className="flex flex-col gap-3">
            <h3 className="font-semibold">2. Your details</h3>
            <Field label="Full name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Position (if signing for a business)" value={title} onChange={(event) => setTitle(event.target.value)} />
              <Field label="Business (if any)" autoComplete="organization" value={company} onChange={(event) => setCompany(event.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <h3 className="font-semibold">3. Sign</h3>
            <SignaturePad allowDrawn={view.allowDrawn} allowTyped={view.allowTyped} defaultName={name} onChange={setSignature} />
          </div>
          <div className="flex flex-col gap-3">
            <h3 className="font-semibold">4. Agree</h3>
            <label className="flex items-start gap-3">
              <Checkbox className="mt-0.5" checked={agreeE} onCheckedChange={(checked) => setAgreeE(checked === true)} />
              <span>I agree to sign this {doc} electronically.</span>
            </label>
            <label className="flex items-start gap-3">
              <Checkbox className="mt-0.5" checked={agreeQ} onCheckedChange={(checked) => setAgreeQ(checked === true)} />
              <span>
                I accept this {doc}, including its terms{chosen.length ? " and the extras I ticked" : ""}, for <strong>{total}</strong> incl. {view.snapshot.tax.taxName}.
              </span>
            </label>
          </div>
          {error && <Alert variant="error">{error}</Alert>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={onCancel}>
              Not now
            </Button>
            <Button type="submit" size="lg" disabled={busy || !agreeE || !agreeQ || !signature || name.trim().length < 2} style={{ background: view.business.accent, color: "#fff" }}>
              {busy ? "Signing…" : `Sign and accept · ${total}`}
            </Button>
          </div>
        </form>
      )}
      {!verified && (
        <>
          {error && <Alert variant="error">{error}</Alert>}
          <Button variant="ghost" className="self-start" onClick={onCancel}>
            Not now
          </Button>
        </>
      )}
    </section>
  );
}

function DeclinePanel({ view, onCancel }: { view: CustomerViewJson; onCancel: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:p-6"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await post(`/q/${view.token}/decline`, { reason: reason || undefined });
          window.location.reload();
        } catch (error) {
          setError((error as Error).message);
          setBusy(false);
        }
      }}
    >
      <h2 className="text-xl font-bold">Decline this quote</h2>
      <Label htmlFor="decline-reason">Anything you&apos;d like {view.business.name} to know? (optional)</Label>
      <textarea
        id="decline-reason"
        rows={3}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        className="w-full rounded-md border border-input bg-card px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {error && <Alert variant="error">{error}</Alert>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Back
        </Button>
        <Button type="submit" variant="destructive" disabled={busy}>
          {busy ? "Sending…" : "Decline quote"}
        </Button>
      </div>
    </form>
  );
}

