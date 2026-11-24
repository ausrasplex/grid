// The handover PDF's HTML (docs/materials-block.md §3), drawn by Chromium
// on landscape A4. Modelled on a builder's printed Fixtures + Finishes
// Schedule: plain white paper, a black ruled table, small capitals for
// headings, centred text. Plain HTML and CSS only; pictures arrive as
// data: URLs (Chromium loads nothing from outside).
//
// Each trade is its own table whose heading (the JOB / SECTION block and
// the column names) repeats on every page. With "Each room on its own
// page", each room is its own table and its name repeats with the heading.

import type { Theme } from "@grid/block-templates";
import type { Column } from "./columns";
import type { PrintLine, PrintSection, ScheduleModel } from "./pdf";

const css = `
  @page { size: A4 landscape; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: "Inter", "Noto Sans", "Liberation Sans", "DejaVu Sans", Arial, sans-serif; font-size: 8.5pt; line-height: 1.35; color: #000; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .caps { text-transform: uppercase; letter-spacing: 0.08em; }
  .new-page { break-before: page; }

  .cover { position: relative; height: 172mm; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 4mm; break-after: page; }
  .cover-logo { position: absolute; top: 0; right: 0; max-height: 22mm; max-width: 60mm; object-fit: contain; }
  .cover h1 { margin: 0; font-size: 24pt; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; }
  .cover .job { font-size: 13pt; letter-spacing: 0.08em; text-transform: uppercase; }
  .cover .sub { font-size: 10pt; color: #333; }
  .cover-picture { margin-top: 4mm; max-width: 200mm; max-height: 92mm; object-fit: contain; }
  .cover-space { height: 92mm; }
  .cover-foot { position: absolute; bottom: 0; left: 0; right: 0; display: flex; justify-content: space-between; font-size: 9pt; }

  table.schedule { width: 100%; border-collapse: collapse; table-layout: fixed; }
  table.schedule thead { display: table-header-group; }
  table.schedule th, table.schedule td { border: 0.75pt solid #000; padding: 1.6mm 2mm; text-align: center; vertical-align: middle; word-wrap: break-word; }
  table.schedule tr { break-inside: avoid; }
  table.schedule .head td { text-align: left; padding: 1.8mm 2.5mm; }
  table.schedule .head td.key { font-weight: 700; }
  /* A room's name stays with its first line. */
  tbody.room-start { break-inside: avoid; }
  th { font-size: 7.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; background: #f2f2f2; }
  .room td { font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; background: #e6e6e6; padding: 1.8mm 2mm; }
  .picture { width: 40mm; height: 26mm; margin: 0 auto; display: flex; align-items: center; justify-content: center; }
  .picture img { max-width: 100%; max-height: 100%; object-fit: contain; }
  .swatch { width: 34mm; height: 18mm; margin: 0 auto; border: 0.75pt solid #000; }
  .model { display: block; color: #333; margin-top: 0.6mm; }
  .notes { white-space: pre-line; text-align: left; }
  a { color: #000; font-weight: 700; letter-spacing: 0.08em; }
  .empty { padding: 30mm 0; text-align: center; font-size: 11pt; }
`;

function Cell({ column, line, images }: { column: Column; line: PrintLine; images: Record<string, string> }) {
  switch (column.key) {
    case "item":
      return <td>{line.item}</td>;
    case "image": {
      const src = line.photoFileId ? images[line.photoFileId] : undefined;
      return (
        <td>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {src ? <div className="picture"><img src={src} alt="" /></div> : line.swatch ? <div className="swatch" style={{ backgroundColor: line.swatch }} /> : null}
        </td>
      );
    }
    case "product":
      return (
        <td>
          {line.product}
          {line.model && <span className="model">{line.model}</span>}
        </td>
      );
    case "finish":
      return (
        <td>
          {line.finish}
          {line.size && <span className="model">{line.size}</span>}
        </td>
      );
    case "qty":
      return <td>{line.qty}</td>;
    case "link":
      return <td>{line.link ? <a href={line.link}>LINK</a> : null}</td>;
    case "notes":
      return <td className="notes">{line.notes}</td>;
  }
}

function Head({ model, section, columns, room }: { model: ScheduleModel; section: PrintSection; columns: Column[]; room?: string | null }) {
  const job = [model.jobName, model.address].filter(Boolean).join(" – ");
  return (
    <thead>
      <tr className="head">
        <td className="key caps">Job:</td>
        <td className="caps" colSpan={columns.length - 1}>
          {job}
        </td>
      </tr>
      <tr className="head">
        <td className="key caps">Section:</td>
        <td className="caps" colSpan={columns.length - 1}>
          {section.name}
        </td>
      </tr>
      <tr>
        {columns.map((column) => (
          <th key={column.key}>{column.label}</th>
        ))}
      </tr>
      {room !== undefined && (
        <tr className="room">
          <td colSpan={columns.length}>{room ?? "General"}</td>
        </tr>
      )}
    </thead>
  );
}

function Rows({ lines, columns, images }: { lines: PrintLine[]; columns: Column[]; images: Record<string, string> }) {
  return (
    <>
      {lines.map((line) => (
        <tr key={line.id}>
          {columns.map((column) => (
            <Cell key={column.key} column={column} line={line} images={images} />
          ))}
        </tr>
      ))}
    </>
  );
}

function Colgroup({ columns }: { columns: Column[] }) {
  const total = columns.reduce((sum, column) => sum + column.width, 0);
  return (
    <colgroup>
      {columns.map((column) => (
        <col key={column.key} style={{ width: `${(column.width / total) * 100}%` }} />
      ))}
    </colgroup>
  );
}

export function HandoverDocument({ model, theme, images, prepared }: { model: ScheduleModel; theme: Theme; images: Record<string, string>; prepared: string }) {
  const cover = model.coverFileId ? images[model.coverFileId] : undefined;
  // Each table after the first starts a new page (the cover ends its own).
  let tables = 0;
  const startsPage = () => (tables++ > 0 ? "schedule new-page" : "schedule");
  return (
    <html lang="en-AU">
      <head>
        <meta charSet="utf-8" />
        <title>{`${model.title} · ${model.jobName}`}</title>
        <style dangerouslySetInnerHTML={{ __html: css }} />
      </head>
      <body>
        {model.cover && (
          <section className="cover">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {theme.logoDataUrl && <img className="cover-logo" src={theme.logoDataUrl} alt="" />}
            <h1>{model.title}</h1>
            <div className="job">{[model.jobName, model.siteName !== model.jobName ? model.siteName : null].filter(Boolean).join(" – ")}</div>
            {model.address && <div className="sub">{model.address}</div>}
            {model.clientName && <div className="sub">Prepared for {model.clientName}</div>}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {cover ? <img className="cover-picture" src={cover} alt="" /> : <div className="cover-space" />}
            <div className="cover-foot">
              <span>{theme.website ?? theme.companyName}</span>
              <span>
                <span className="caps">Date prepared:</span> {prepared}
              </span>
            </div>
          </section>
        )}
        {model.sections.length === 0 && <p className="empty">Nothing on the handover list yet.</p>}
        {model.sections.map((section) =>
          model.roomPerPage ? (
            section.rooms.map((room) => (
              <table key={`${section.trade}:${room.room ?? ""}`} className={startsPage()}>
                <Colgroup columns={section.columns} />
                <Head model={model} section={section} columns={section.columns} room={room.room} />
                <tbody>
                  <Rows lines={room.lines} columns={section.columns} images={images} />
                </tbody>
              </table>
            ))
          ) : (
            <table key={section.trade} className={startsPage()}>
              <Colgroup columns={section.columns} />
              <Head model={model} section={section} columns={section.columns} />
              {section.rooms.map((room) => (
                <RoomRows key={room.room ?? ""} room={room} columns={section.columns} images={images} />
              ))}
            </table>
          ),
        )}
      </body>
    </html>
  );
}

/** A room: its name and first line kept together on a page, then the rest. */
function RoomRows({ room, columns, images }: { room: PrintSection["rooms"][number]; columns: Column[]; images: Record<string, string> }) {
  return (
    <>
      <tbody className="room-start">
        <tr className="room">
          <td colSpan={columns.length}>{room.room ?? "General"}</td>
        </tr>
        <Rows lines={room.lines.slice(0, 1)} columns={columns} images={images} />
      </tbody>
      {room.lines.length > 1 && (
        <tbody>
          <Rows lines={room.lines.slice(1)} columns={columns} images={images} />
        </tbody>
      )}
    </>
  );
}
