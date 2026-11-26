"use client";

// Print tags (docs/assets-block.md §1): pick the label paper by what's on
// its packet (labels per sheet and size, with the Avery code most brands
// say they match), or type in a Custom layout; start further along a
// part-used sheet; print a test page on plain paper to check it lines up,
// and nudge everything if the printer prints a little off.
import { useEffect, useState } from "react";
import { Download, Ruler } from "lucide-react";
import { Alert, Button, Field, FormActions, Segmented, SelectField, Sheet, SheetContent, api, useAction } from "@grid/ui";

interface Layout {
  id: string;
  label: string;
  hint: string;
  columns: number;
  rows: number;
}
interface Custom {
  paper: "a4" | "roll";
  columns: number;
  rows: number;
  width: number;
  height: number;
  top: number;
  left: number;
  gapX: number;
  gapY: number;
}
interface Settings {
  layout: string;
  custom: Custom | null;
  offsetX: number;
  offsetY: number;
  layouts: Layout[];
}

const BLANK_CUSTOM: Custom = { paper: "a4", columns: 3, rows: 7, width: 63.5, height: 38.1, top: 15, left: 7, gapX: 2.5, gapY: 0 };
/** Fetches the PDF and saves it: a download, not a new tab (a new tab leaves the installed app). */
export async function download(href: string, filename: string) {
  const response = await fetch(href, { credentials: "same-origin" });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error?.message ?? "Couldn't make the PDF");
  }
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function Number({ label, value, onChange, hint }: { label: string; value: number; onChange: (value: number) => void; hint?: string }) {
  return <Field label={label} hint={hint} inputMode="decimal" value={String(value)} onChange={(event) => onChange(globalThis.Number(event.target.value.replace(",", ".")) || 0)} />;
}

export function PrintTagsSheet({ assetIds, onClose }: { assetIds: string[]; onClose: () => void }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [layout, setLayout] = useState("a4-21");
  const [custom, setCustom] = useState<Custom>(BLANK_CUSTOM);
  const [start, setStart] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [adjusting, setAdjusting] = useState(false);
  const action = useAction();

  useEffect(() => {
    void action.run(async () => {
      const loaded = await api<Settings>("/assets/stickers/settings");
      setSettings(loaded);
      setLayout(loaded.layout);
      if (loaded.custom) setCustom(loaded.custom);
      setOffset({ x: loaded.offsetX, y: loaded.offsetY });
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const chosen = settings?.layouts.find((entry) => entry.id === layout);
  const spaces = layout === "custom" ? (custom.paper === "roll" ? 1 : custom.columns * custom.rows) : chosen ? chosen.columns * chosen.rows : 1;
  const setCustomPart = (changes: Partial<Custom>) => setCustom({ ...custom, ...changes });
  // The layout, Custom measurements and nudge are kept for the business before printing.
  const save = () => api("/assets/stickers/settings", { method: "PUT", body: { layout, custom: layout === "custom" ? custom : undefined, offsetX: offset.x, offsetY: offset.y } });

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent desktop="dialog" title={assetIds.length === 1 ? "Print a tag" : `Print ${assetIds.length} tags`} description="Pick the label paper by what's on its packet. Most brands say which Avery labels they match.">
        <div className="flex flex-col gap-4 px-2">
          {settings && (
            <SelectField
              label="Label paper"
              value={layout}
              onChange={(event) => (setLayout(event.target.value), setStart(1))}
              options={[...settings.layouts.map((entry) => ({ value: entry.id, label: `${entry.label} (${entry.hint})` })), { value: "custom", label: "Custom: type in the sizes from the packet" }]}
            />
          )}

          {layout === "custom" && (
            <div className="flex flex-col gap-3 rounded-xl bg-muted/40 p-3">
              <Segmented
                label="Paper"
                value={custom.paper}
                onChange={(paper) => setCustomPart({ paper })}
                items={[
                  { value: "a4", label: "A4 sheet" },
                  { value: "roll", label: "Label printer" },
                ]}
              />
              <div className="grid grid-cols-2 gap-3">
                <Number label="Label width (mm)" value={custom.width} onChange={(width) => setCustomPart({ width })} />
                <Number label="Label height (mm)" value={custom.height} onChange={(height) => setCustomPart({ height })} />
                {custom.paper === "a4" && (
                  <>
                    <Number label="Across" value={custom.columns} onChange={(columns) => setCustomPart({ columns: Math.round(columns) })} />
                    <Number label="Down" value={custom.rows} onChange={(rows) => setCustomPart({ rows: Math.round(rows) })} />
                    <Number label="Top margin (mm)" hint="Top of the page to the first label" value={custom.top} onChange={(top) => setCustomPart({ top })} />
                    <Number label="Side margin (mm)" hint="Left edge to the first label" value={custom.left} onChange={(left) => setCustomPart({ left })} />
                    <Number label="Gap across (mm)" value={custom.gapX} onChange={(gapX) => setCustomPart({ gapX })} />
                    <Number label="Gap down (mm)" value={custom.gapY} onChange={(gapY) => setCustomPart({ gapY })} />
                  </>
                )}
              </div>
              <p className="text-sm text-muted-foreground">Packets usually list the label size, how many across and down, and the margins. Measure with a ruler if not, then print a test page.</p>
            </div>
          )}

          {spaces > 1 && (
            <Field
              label="Start at label"
              hint={`For a sheet that's partly used: 1 is the top left, counting across then down (1 to ${spaces}).`}
              inputMode="numeric"
              value={String(start)}
              onChange={(event) => setStart(Math.min(Math.max(globalThis.Number(event.target.value.replace(/\D/g, "")) || 1, 1), spaces))}
            />
          )}

          {adjusting ? (
            <div className="flex flex-col gap-3 rounded-xl bg-muted/40 p-3">
              <p className="text-sm">If the test page prints a little off, move everything. Positive moves right or down.</p>
              <div className="grid grid-cols-2 gap-3">
                <Number label="Right (mm)" value={offset.x} onChange={(x) => setOffset({ ...offset, x: Math.max(-10, Math.min(10, x)) })} />
                <Number label="Down (mm)" value={offset.y} onChange={(y) => setOffset({ ...offset, y: Math.max(-10, Math.min(10, y)) })} />
              </div>
            </div>
          ) : (
            <button type="button" className="min-h-touch self-start text-sm font-semibold text-primary" onClick={() => setAdjusting(true)}>
              {offset.x || offset.y ? `Moved ${offset.x} mm right, ${offset.y} mm down. Change` : "Printer prints a little off? Move everything"}
            </button>
          )}

          <Alert variant="error">{action.error}</Alert>
          <FormActions>
            <Button
              type="button"
              variant="outline"
              disabled={!settings || action.busy}
              onClick={() =>
                void action.run(async () => {
                  await save();
                  await download(`/api/assets/stickers/test.pdf?layout=${layout}`, "Sticker test page.pdf");
                })
              }
            >
              <Ruler /> Test page
            </Button>
            <Button
              type="button"
              size="lg"
              disabled={!settings || action.busy}
              onClick={() =>
                void action.run(async () => {
                  await save();
                  await download(`/api/assets/stickers.pdf?${new URLSearchParams({ ids: assetIds.join(","), layout, start: String(start) })}`, assetIds.length === 1 ? "Asset tag.pdf" : "Asset tags.pdf");
                })
              }
            >
              <Download /> Download PDF
            </Button>
          </FormActions>
          <p className="text-sm text-muted-foreground">Print at actual size (100%), not &quot;fit to page&quot;. The test page prints each label&apos;s outline: hold it against the label sheet up to the light.</p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
