// The sticker sheet's HTML, drawn by Chromium at the label sheet's exact
// size (docs/assets-block.md §1). Each sticker: the QR code, the business's
// logo or name, "Asset No. 12", the asset's name, and the code to type in
// when a camera won't read it. The QR codes arrive as SVG.

import { isCompact, qrSide, type Placed, type StickerLayout } from "./sticker-layouts";

export interface Sticker {
  number: number;
  name: string;
  code: string;
  qrSvg: string;
}

const css = (layout: StickerLayout, compact: boolean, qr: number) => `
  @page { size: ${layout.page.width}mm ${layout.page.height}mm; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: "Inter", "Noto Sans", "Liberation Sans", "DejaVu Sans", Arial, sans-serif; color: #000; }
  .page { position: relative; width: ${layout.page.width}mm; height: ${layout.page.height}mm; overflow: hidden; break-after: page; }
  .page:last-child { break-after: auto; }
  .sticker { position: absolute; width: ${layout.width}mm; height: ${layout.height}mm; display: flex; align-items: center; gap: ${compact ? 1.5 : 2.5}mm; padding: ${compact ? "1.5mm 2mm" : "2.5mm 3mm"}; overflow: hidden; }
  .qr { flex-shrink: 0; width: ${qr}mm; height: ${qr}mm; }
  .qr svg { width: 100%; height: 100%; display: block; }
  .text { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 0.6mm; }
  .owner { font-size: 6.5pt; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .logo { max-height: 6mm; max-width: 100%; object-fit: contain; object-position: left; }
  .number { font-size: ${compact ? 9 : layout.height > 50 ? 16 : 12}pt; font-weight: 800; line-height: 1.05; }
  .name { font-size: 7pt; line-height: 1.2; max-height: 2.4em; overflow: hidden; }
  .outline { border: 0.3mm dashed #000; border-radius: 1.5mm; justify-content: center; font-size: 14pt; font-weight: 700; color: #555; }
  .code { font-family: "DejaVu Sans Mono", "Liberation Mono", monospace; font-size: ${compact ? 5.5 : 6.5}pt; letter-spacing: 0.04em; }
`;

/** `outline`: the test page, each label drawn as a box with its position number. */
export function StickerDocument({ layout, placed, owner, logoDataUrl, outline = false }: { layout: StickerLayout; placed: Placed<Sticker>[]; owner: string; logoDataUrl: string | null; outline?: boolean }) {
  const pages = Math.max(1, ...placed.map((entry) => entry.page + 1));
  const compact = isCompact(layout);
  return (
    <html lang="en-AU">
      <head>
        <meta charSet="utf-8" />
        <title>Asset tags</title>
        <style dangerouslySetInnerHTML={{ __html: css(layout, compact, qrSide(layout)) }} />
      </head>
      <body>
        {Array.from({ length: pages }, (_, page) => (
          <div key={page} className="page">
            {placed
              .filter((entry) => entry.page === page)
              .map((entry) =>
                outline ? (
                  <div key={entry.item.code} className="sticker outline" style={{ left: `${entry.x}mm`, top: `${entry.y}mm` }}>
                    {entry.item.number}
                  </div>
                ) : (
                  <div key={entry.item.code} className="sticker" style={{ left: `${entry.x}mm`, top: `${entry.y}mm` }}>
                    <div className="qr" dangerouslySetInnerHTML={{ __html: entry.item.qrSvg }} />
                    <div className="text">
                      {!compact &&
                        // eslint-disable-next-line @next/next/no-img-element
                        (logoDataUrl ? <img className="logo" src={logoDataUrl} alt="" /> : <div className="owner">{owner}</div>)}
                      <div className="number">{compact ? `No. ${entry.item.number}` : `Asset No. ${entry.item.number}`}</div>
                      {!compact && <div className="name">{entry.item.name}</div>}
                      <div className="code">{entry.item.code}</div>
                    </div>
                  </div>
                ),
              )}
          </div>
        ))}
      </body>
    </html>
  );
}
