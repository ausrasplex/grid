// The quote as the customer sees it: the PDF, and once signed, the signed
// copy (acceptance filled in, chosen extras in the total, then the signing
// certificate). Renders only from the frozen snapshot, never live data.

import type { Theme } from "@grid/block-templates";
import { DocShell } from "@grid/block-templates/document";
import { SigningCertificate } from "@grid/block-signatures/certificate";
import type { CertificateInfo } from "@grid/block-signatures";
import { formatMoney, groupBySection } from "./money";
import { totalsFor, type QuoteSnapshot } from "./snapshot";

const qtyText = (quantity: number) => (Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(3).replace(/0+$/, ""));

export interface Acceptance {
  signerName: string;
  signerTitle: string | null;
  signerCompany: string | null;
  signatureDataUrl: string;
  signedAt: Date;
  /** Indexes of the optional lines chosen. */
  chosen: number[];
}

export function QuoteDocument({
  theme,
  snapshot,
  draft,
  accepted,
  certificate,
}: {
  theme: Theme;
  snapshot: QuoteSnapshot;
  draft: boolean;
  accepted?: Acceptance;
  certificate?: CertificateInfo;
}) {
  const money = (cents: number) => formatMoney(cents, snapshot.tax.currency, snapshot.tax.locale);
  const tax = snapshot.tax;
  const pricesIncludeTax = tax.pricesIncludeTax;
  const indexed = snapshot.lines.map((line, index) => ({ ...line, index }));
  const main = indexed.filter((line) => !line.optional);
  const options = indexed.filter((line) => line.optional);
  const chosen = new Set(accepted?.chosen ?? []);
  const totals = accepted ? totalsFor(snapshot, accepted.chosen) : snapshot.totals;

  // Sections view: one row per section with its total.
  const sections = new Map<string, number>();
  for (const line of main) sections.set(line.section || "Works", (sections.get(line.section || "Works") ?? 0) + line.amountCents);

  const meta: [string, string][] = [
    [`${tax.documentTitle} no.`, snapshot.revision ? `${snapshot.number} Rev ${snapshot.revision}` : snapshot.number],
    ["Date", snapshot.date],
    ["Valid until", snapshot.validUntil],
  ];

  const lineTable = (rows: typeof main, withChoice = false) => (
    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th className="num">Qty</th>
          <th className="num">Unit price</th>
          <th className="num">Amount</th>
          {withChoice && <th className="num">Chosen</th>}
        </tr>
      </thead>
      <tbody>
        {groupBySection(rows).map((group, index) => [
          group.section ? (
            <tr key={`s${index}`}>
              <td colSpan={withChoice ? 5 : 4} style={{ fontWeight: 700, paddingTop: 12 }}>
                {group.section}
              </td>
            </tr>
          ) : null,
          ...group.items.map(({ line }) => (
            <tr key={line.index} className="avoid">
              <td className="text">
                {line.description}
                {line.taxLabel && <span className="muted small"> · {line.taxLabel}</span>}
              </td>
              <td className="num">
                {qtyText(line.qty)} {line.unit !== "each" ? line.unit : ""}
              </td>
              <td className="num">{money(line.unitCents)}</td>
              <td className="num">{money(line.amountCents)}</td>
              {withChoice && <td className="num" style={{ fontWeight: 700 }}>{chosen.has(line.index) ? "✓ Yes" : "No"}</td>}
            </tr>
          )),
        ])}
      </tbody>
    </table>
  );

  return (
    <DocShell
      theme={theme}
      title={accepted ? `${tax.documentTitle} · Accepted` : tax.documentTitle}
      meta={meta}
      businessLines={[tax.registrationNumber ? `${tax.registrationLabel} ${tax.registrationNumber}` : null]}
      watermark={draft ? "DRAFT" : undefined}
    >
      <div className="two avoid">
        <div className="box">
          <div className="muted small">Prepared for</div>
          {snapshot.client ? (
            <>
              <div style={{ fontWeight: 700 }}>{snapshot.client.name}</div>
              <div className="text small">
                {[snapshot.client.contactName && snapshot.client.contactName !== snapshot.client.name ? `Attn: ${snapshot.client.contactName}` : null, snapshot.client.address, snapshot.client.email, snapshot.client.phone, snapshot.client.abn ? `${tax.registrationLabel} ${snapshot.client.abn}` : null]
                  .filter(Boolean)
                  .join("\n")}
              </div>
            </>
          ) : (
            <div className="muted">—</div>
          )}
        </div>
        <div className="box">
          <div className="muted small">Job</div>
          <div style={{ fontWeight: 700 }}>{snapshot.title}</div>
          {snapshot.siteAddress && <div className="text small">{snapshot.siteAddress}</div>}
        </div>
      </div>

      {snapshot.intro && <p className="text" style={{ marginTop: 16 }}>{snapshot.intro}</p>}

      <h2>{snapshot.clientView === "LUMP" ? "Scope" : "Pricing"}</h2>
      {snapshot.clientView === "ITEMISED" && lineTable(main)}
      {snapshot.clientView === "SECTIONS" && (
        <table>
          <thead>
            <tr>
              <th>Section</th>
              <th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {[...sections].map(([name, cents]) => (
              <tr key={name} className="avoid">
                <td>{name}</td>
                <td className="num">{money(cents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {snapshot.clientView === "LUMP" && (
        <ul className="text">
          {main.map((line) => (
            <li key={line.index}>{line.description}</li>
          ))}
        </ul>
      )}

      {options.length > 0 && (
        <>
          <h2>Optional extras</h2>
          <p className="muted small">
            {accepted ? "Extras marked Yes were chosen when this quote was accepted and are included in the total." : "Not included in the total. Choose any you'd like when you accept."}
          </p>
          {lineTable(options, !!accepted)}
        </>
      )}

      <table className="totals avoid">
        <tbody>
          {!pricesIncludeTax && (
            <tr>
              <td>Subtotal</td>
              <td className="num">{money(totals.subtotalExCents)}</td>
            </tr>
          )}
          {totals.taxByCode
            .filter((code) => code.rate > 0)
            .map((code) => (
              <tr key={code.label}>
                <td>
                  {pricesIncludeTax ? `Includes ${code.label}` : code.label} ({Math.round(code.rate * 1000) / 10}%)
                </td>
                <td className="num">{money(code.taxCents)}</td>
              </tr>
            ))}
          <tr className="grand">
            <td>Total {tax.currency !== "AUD" ? tax.currency : ""} incl. {tax.taxName}</td>
            <td className="num">{money(totals.totalCents)}</td>
          </tr>
        </tbody>
      </table>

      {snapshot.terms && (
        <>
          <h2>Terms</h2>
          <div className="text small">{snapshot.terms}</div>
        </>
      )}

      {accepted ? (
        <div className="box avoid" style={{ marginTop: 20 }}>
          <div style={{ fontWeight: 700 }}>Accepted</div>
          <div className="small">
            I accept this {tax.documentTitle.toLowerCase()}, including the terms and the extras chosen above, for {money(totals.totalCents)} incl. {tax.taxName}.
          </div>
          <div className="two" style={{ marginTop: 10, alignItems: "flex-end" }}>
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={accepted.signatureDataUrl} alt="Signature" style={{ maxHeight: 70, maxWidth: "100%", display: "block" }} />
              <div style={{ borderTop: "1px solid #9ca3af", paddingTop: 4 }} className="small">
                {[accepted.signerName, accepted.signerTitle, accepted.signerCompany].filter(Boolean).join(", ")}
              </div>
            </div>
            <div className="small">
              <div className="muted">Signed electronically</div>
              {accepted.signedAt.toLocaleString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" })}
              {certificate && <div className="muted">Verify code {certificate.verifyCode}</div>}
            </div>
          </div>
        </div>
      ) : (
        <div className="box avoid" style={{ marginTop: 20 }}>
          <div style={{ fontWeight: 700 }}>To accept</div>
          <div className="small">
            {snapshot.acceptOnline ? "Use the link in the email to accept and sign online, or reply" : "Reply"} to {theme.email || snapshot.preparedBy.email} quoting {snapshot.number}
            {theme.phone ? ` or call ${theme.phone}` : ""}. This {tax.documentTitle.toLowerCase()} is valid until {snapshot.validUntil}.
          </div>
          <div className="small muted" style={{ marginTop: 6 }}>Prepared by {snapshot.preparedBy.name}</div>
        </div>
      )}

      {certificate && <SigningCertificate certificate={certificate} />}
    </DocShell>
  );
}
