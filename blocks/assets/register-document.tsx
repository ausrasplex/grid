// The asset register PDF's HTML (docs/assets-block.md "What part 4b
// built"), drawn by Chromium on landscape A4. Like Docket's Insurance
// Report: every asset in service with what an insurer or the accountant
// asks for (what it is, its serial, when it was bought, what it cost and
// would cost to replace), grouped by category with totals. Plain HTML and
// CSS; photos arrive as data: URLs.

export interface RegisterLine {
  number: number;
  name: string;
  makeModel: string;
  serial: string | null;
  /** Kit pieces: "Battery (SN 123), Charger". */
  pieces: string | null;
  bought: string | null;
  supplier: string | null;
  paid: number | null;
  replacement: number | null;
  warranty: string | null;
  where: string;
  photo: string | null;
}

export interface RegisterGroup {
  category: string;
  lines: RegisterLine[];
}

const money = (amount: number | null) => (amount === null ? "" : amount.toLocaleString("en-AU", { style: "currency", currency: "AUD" }));
/** What a line is worth: what it would cost to replace, or what was paid when that's all there is. */
export const lineValue = (line: RegisterLine) => line.replacement ?? line.paid ?? 0;

const css = `
  @page { size: A4 landscape; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: "Inter", "Noto Sans", "Liberation Sans", "DejaVu Sans", Arial, sans-serif; font-size: 8.5pt; line-height: 1.35; color: #111; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  header { display: flex; justify-content: space-between; align-items: flex-start; gap: 8mm; margin-bottom: 6mm; }
  header h1 { margin: 0; font-size: 18pt; }
  header p { margin: 1mm 0 0; color: #444; }
  header img { max-height: 16mm; max-width: 50mm; object-fit: contain; }
  .totals { display: flex; gap: 10mm; margin: 0 0 6mm; padding: 3mm 4mm; background: #f2f2f2; border-radius: 2mm; }
  .totals b { display: block; font-size: 12pt; }
  h2 { font-size: 11pt; margin: 6mm 0 2mm; break-after: avoid; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  thead { display: table-header-group; }
  th, td { border-bottom: 0.5pt solid #bbb; padding: 1.6mm 1.6mm; text-align: left; vertical-align: top; word-wrap: break-word; }
  th { font-size: 7pt; text-transform: uppercase; letter-spacing: 0.06em; color: #444; border-bottom: 0.75pt solid #000; }
  tr { break-inside: avoid; }
  td.num, th.num { text-align: right; }
  .photo { width: 14mm; height: 14mm; object-fit: cover; border-radius: 1mm; display: block; }
  .muted { color: #555; }
  tfoot td { font-weight: 700; border-bottom: none; border-top: 0.75pt solid #000; }
`;

export function RegisterDocument({ owner, logo, made, groups }: { owner: string; logo: string | null; made: string; groups: RegisterGroup[] }) {
  const all = groups.flatMap((group) => group.lines);
  const paid = all.reduce((sum, line) => sum + (line.paid ?? 0), 0);
  const value = all.reduce((sum, line) => sum + lineValue(line), 0);
  return (
    <html lang="en-AU">
      <head>
        <meta charSet="utf-8" />
        <style dangerouslySetInnerHTML={{ __html: css }} />
      </head>
      <body>
        <header>
          <div>
            <h1>Asset register</h1>
            <p>
              {owner} · {made}
            </p>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logo && <img src={logo} alt="" />}
        </header>
        <div className="totals">
          <span>
            Assets<b>{all.length}</b>
          </span>
          <span>
            Paid<b>{money(paid)}</b>
          </span>
          <span>
            To replace<b>{money(value)}</b>
          </span>
        </div>
        {groups.map((group) => (
          <section key={group.category}>
            <h2>{group.category}</h2>
            <table>
              <colgroup>
                <col style={{ width: "17mm" }} />
                <col style={{ width: "12mm" }} />
                <col />
                <col style={{ width: "34mm" }} />
                <col style={{ width: "22mm" }} />
                <col style={{ width: "28mm" }} />
                <col style={{ width: "22mm" }} />
                <col style={{ width: "22mm" }} />
                <col style={{ width: "22mm" }} />
                <col style={{ width: "38mm" }} />
              </colgroup>
              <thead>
                <tr>
                  <th />
                  <th>No.</th>
                  <th>Asset</th>
                  <th>Serial</th>
                  <th>Bought</th>
                  <th>Where bought</th>
                  <th className="num">Paid</th>
                  <th className="num">To replace</th>
                  <th>Warranty to</th>
                  <th>Where it is</th>
                </tr>
              </thead>
              <tbody>
                {group.lines.map((line) => (
                  <tr key={line.number}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <td>{line.photo && <img className="photo" src={line.photo} alt="" />}</td>
                    <td>{line.number}</td>
                    <td>
                      {line.name}
                      {line.makeModel && <div className="muted">{line.makeModel}</div>}
                      {line.pieces && <div className="muted">With: {line.pieces}</div>}
                    </td>
                    <td>{line.serial}</td>
                    <td>{line.bought}</td>
                    <td>{line.supplier}</td>
                    <td className="num">{money(line.paid)}</td>
                    <td className="num">{money(line.replacement)}</td>
                    <td>{line.warranty}</td>
                    <td>{line.where}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={6}>
                    {group.lines.length} asset{group.lines.length === 1 ? "" : "s"}
                  </td>
                  <td className="num">{money(group.lines.reduce((sum, line) => sum + (line.paid ?? 0), 0))}</td>
                  <td className="num">{money(group.lines.reduce((sum, line) => sum + lineValue(line), 0))}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </section>
        ))}
        {!all.length && <p>No assets in service yet.</p>}
      </body>
    </html>
  );
}
