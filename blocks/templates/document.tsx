// The frame every document shares: business header with logo and
// details, then the document's own body. Used for PDFs (via toHtml) and,
// in 3b, the customer's online view, so both look the same. Plain HTML and
// CSS only, light on white, A4.

import type { ReactNode } from "react";
import type { Theme } from "./service";

export const documentCss = (accent: string) => `
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: "Inter", "Noto Sans", "Liberation Sans", "DejaVu Sans", Arial, sans-serif; font-size: 10.5pt; line-height: 1.45; color: #111827; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .doc { max-width: 190mm; margin: 0 auto; }
  .doc-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; padding-bottom: 14px; border-bottom: 3px solid ${accent}; margin-bottom: 18px; }
  .doc-brand { display: flex; gap: 14px; align-items: flex-start; }
  .doc-logo { max-height: 64px; max-width: 180px; object-fit: contain; }
  .doc-company { font-size: 14pt; font-weight: 700; margin: 0; }
  .doc-details { color: #4b5563; font-size: 9pt; margin-top: 2px; white-space: pre-line; }
  .doc-title { text-align: right; }
  .doc-title h1 { margin: 0; font-size: 20pt; letter-spacing: 0.02em; color: ${accent}; text-transform: uppercase; }
  .doc-title .meta { font-size: 9.5pt; color: #374151; margin-top: 4px; }
  .doc-title .meta div { white-space: nowrap; }
  .watermark { position: fixed; top: 40%; left: 0; right: 0; text-align: center; font-size: 90pt; font-weight: 800; color: rgba(17,24,39,0.06); transform: rotate(-20deg); pointer-events: none; }
  h2 { font-size: 11pt; margin: 18px 0 6px; color: ${accent}; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.04em; color: #fff; background: ${accent}; padding: 6px 8px; }
  td { padding: 7px 8px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
  .num { text-align: right; white-space: nowrap; }
  .muted { color: #6b7280; }
  .small { font-size: 9pt; }
  .totals { margin-left: auto; width: 46%; margin-top: 10px; }
  .totals td { border: none; padding: 3px 8px; }
  .totals .grand td { font-size: 12.5pt; font-weight: 700; border-top: 2px solid ${accent}; padding-top: 6px; }
  .box { border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px 12px; }
  .two { display: flex; gap: 16px; }
  .two > * { flex: 1; }
  .text { white-space: pre-line; }
  .avoid { break-inside: avoid; }
`;

function details(theme: Theme, extra: (string | null | undefined)[]) {
  return [
    theme.address,
    [theme.phone, theme.email].filter(Boolean).join("  ·  "),
    theme.website,
    ...extra,
    theme.licenceNumber ? `${theme.licenceLabel || "Licence no."} ${theme.licenceNumber}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export function DocShell({
  theme,
  title,
  meta,
  businessLines = [],
  watermark,
  children,
}: {
  theme: Theme;
  /** "Quote", "Photo report"… */
  title: string;
  /** Right-hand lines under the title: number, date… */
  meta: [string, string][];
  /** Extra lines under the business details, e.g. "ABN 12 345 678 901". */
  businessLines?: (string | null | undefined)[];
  /** e.g. "DRAFT" across the page. */
  watermark?: string;
  children: ReactNode;
}) {
  return (
    <html lang="en-AU">
      <head>
        <meta charSet="utf-8" />
        <title>{`${title} · ${theme.companyName}`}</title>
        <style dangerouslySetInnerHTML={{ __html: documentCss(theme.accentColor) }} />
      </head>
      <body>
        {watermark && <div className="watermark">{watermark}</div>}
        <div className="doc">
          <header className="doc-head">
            <div className="doc-brand">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {theme.logoDataUrl && <img className="doc-logo" src={theme.logoDataUrl} alt="" />}
              <div>
                <p className="doc-company">{theme.companyName}</p>
                <div className="doc-details">{details(theme, businessLines)}</div>
              </div>
            </div>
            <div className="doc-title">
              <h1>{title}</h1>
              <div className="meta">
                {meta.map(([label, value]) => (
                  <div key={label}>
                    <span className="muted">{label}</span> {value}
                  </div>
                ))}
              </div>
            </div>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
