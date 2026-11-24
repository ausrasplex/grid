"use client";

// A job's handover sheet settings (docs/materials-block.md §2–§3): show
// quantities, each room on its own page, the cover page with its title and
// picture (a photo of the house or the front elevation).

import { useRef, useState, type ReactNode } from "react";
import { Image as ImageIcon } from "lucide-react";
import { Alert, Button, Field, FormActions, Sheet, SheetContent, Switch, api, useAction } from "@grid/ui";
import { photoUrl, uploadPhoto } from "@grid/block-materials/components";
import type { JobSettingsJson } from "./shared";

function SwitchRow({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex min-h-touch items-center gap-3">
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{label}</span>
        <span className="block text-sm text-muted-foreground">{hint}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

export function JobSettingsSheet({
  projectId,
  settings,
  companyTitle,
  onClose,
  onSaved,
}: {
  projectId: string;
  settings: JobSettingsJson;
  companyTitle: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState({ showQty: settings.showQty, roomPerPage: settings.roomPerPage, cover: settings.cover, title: settings.title ?? "", coverFileId: settings.coverFileId });
  const [uploading, setUploading] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const action = useAction();
  const set = (change: Partial<typeof form>) => setForm({ ...form, ...change });

  let cover: ReactNode = null;
  if (form.cover) {
    cover = (
      <>
        <Field label="Title" placeholder={companyTitle} value={form.title} onChange={(event) => set({ title: event.target.value })} hint="Leave blank for your usual title (Settings › Handover)." />
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Cover picture</span>
          <input
            ref={picker}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              setUploading(true);
              action.setError(null);
              try {
                set({ coverFileId: await uploadPhoto(file) });
              } catch (failure) {
                action.setError((failure as Error).message);
              } finally {
                setUploading(false);
              }
            }}
          />
          {form.coverFileId && <img src={photoUrl(form.coverFileId, "display")} alt="The cover picture" className="max-h-48 w-full rounded-lg bg-muted object-contain" />}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => picker.current?.click()} disabled={uploading}>
              <ImageIcon /> {uploading ? "Uploading…" : form.coverFileId ? "Change picture" : "Add a picture"}
            </Button>
            {form.coverFileId && (
              <Button type="button" variant="ghost" onClick={() => set({ coverFileId: null })} disabled={uploading}>
                Take it off
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">A photo of the house, or the designer&apos;s front elevation. Without one the space stays empty.</p>
        </div>
      </>
    );
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent desktop="dialog" title="Sheet settings" description="How this job's handover sheet prints.">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void action.run(async () => {
              await api(`/handover/job/${projectId}/settings`, { method: "PUT", body: { ...form, title: form.title.trim() || null } });
              await onSaved();
            });
          }}
        >
          <SwitchRow label="Show quantities" hint="A Qty column. Blank quantities print TBC." checked={form.showQty} onChange={(showQty) => set({ showQty })} />
          <SwitchRow label="Each room on its own page" hint="Off: rooms follow on, one after another." checked={form.roomPerPage} onChange={(roomPerPage) => set({ roomPerPage })} />
          <SwitchRow label="Cover page" hint="Title, job and address, a picture, your logo and the date." checked={form.cover} onChange={(on) => set({ cover: on })} />
          {cover}
          <Alert variant="error">{action.error}</Alert>
          <FormActions>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="lg" disabled={action.busy || uploading}>
              {action.busy ? "Saving…" : "Save"}
            </Button>
          </FormActions>
        </form>
      </SheetContent>
    </Sheet>
  );
}
