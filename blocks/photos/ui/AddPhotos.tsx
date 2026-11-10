"use client";

// After picking or taking photos: which job and area, before/after, an
// optional caption, then Save. Saving puts them in the outbox on the phone,
// so it works the same with or without signal.

import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Field, FormActions, Segmented, SelectField, api } from "@grid/ui";
import { areaKey, areaLabel, type AreaOpt } from "./areas";
import { addToOutbox, newId, prepareImage } from "./outbox";

export interface JobOpt {
  id: string;
  name: string;
  meta?: string;
}

interface Props {
  files: File[];
  job: JobOpt;
  areas: AreaOpt[];
  defaultArea: { buildingId: string; levelId: string | null } | null;
  /** Lets the person move the photos to another job (centre button). */
  jobs?: JobOpt[];
  onSaved: (jobId: string, area: { buildingId: string; levelId: string | null } | null) => void;
  onCancel: () => void;
}

export function AddPhotos({ files, job: initialJob, areas: initialAreas, defaultArea, jobs, onSaved, onCancel }: Props) {
  const [job, setJob] = useState(initialJob);
  const [areas, setAreas] = useState(initialAreas);
  const [area, setArea] = useState(defaultArea ? areaKey(defaultArea) : areas.length === 1 ? areaKey(areas[0]!) : "");
  const [tag, setTag] = useState<"NONE" | "BEFORE" | "AFTER">("NONE");
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previews = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files]);
  useEffect(() => () => previews.forEach((preview) => URL.revokeObjectURL(preview)), [previews]);

  async function changeJob(id: string) {
    const next = jobs?.find((job) => job.id === id);
    if (!next) return;
    setJob(next);
    try {
      const view = await api<{ areas: AreaOpt[]; lastArea: { buildingId: string; levelId: string | null } | null }>(`/projects/${id}`);
      setAreas(view.areas);
      setArea(view.lastArea ? areaKey(view.lastArea) : view.areas.length === 1 ? areaKey(view.areas[0]!) : "");
    } catch {
      // Offline: we don't know this job's areas, so file it against the whole job.
      setAreas([]);
      setArea("");
    }
  }

  const picked = areas.find((choice) => areaKey(choice) === area) ?? null;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
          const now = Date.now();
          const items = await Promise.all(
            files.map(async (file, index) => {
              const { blob, name } = await prepareImage(file);
              return {
                id: newId(),
                projectId: job.id,
                jobName: job.name,
                buildingId: picked?.buildingId ?? null,
                levelId: picked?.levelId ?? null,
                tag,
                caption: caption.trim(),
                // Camera photos have a fresh lastModified; library photos keep when they were taken.
                takenAt: Math.min(file.lastModified || now, now) + index,
                blob,
                name,
                state: "waiting" as const,
              };
            }),
          );
          await addToOutbox(items);
          onSaved(job.id, picked ? { buildingId: picked.buildingId, levelId: picked.levelId } : null);
        } catch (error) {
          setError((error as Error).message || "Couldn't save the photos on this phone");
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {previews.map((previewUrl, index) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={previewUrl} src={previewUrl} alt={`Photo ${index + 1}`} className="size-24 shrink-0 rounded-lg object-cover" />
        ))}
      </div>

      {jobs && jobs.length > 1 && (
        <SelectField
          label="Job"
          value={job.id}
          onChange={(event) => changeJob(event.target.value)}
          options={jobs.map((job) => ({ value: job.id, label: job.meta ? `${job.name} · ${job.meta}` : job.name }))}
        />
      )}

      {areas.length > 1 && (
        <SelectField
          label="Where"
          value={area}
          onChange={(event) => setArea(event.target.value)}
          options={[{ value: "", label: "Whole job" }, ...areas.map((area) => ({ value: areaKey(area), label: areaLabel(areas, area.buildingId, area.levelId) ?? area.buildingName }))]}
        />
      )}

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Before or after?</span>
        <Segmented
          label="Before or after"
          value={tag}
          onChange={setTag}
          items={[
            { value: "NONE", label: "Neither" },
            { value: "BEFORE", label: "Before" },
            { value: "AFTER", label: "After" },
          ]}
        />
      </div>

      <Field label="Caption" hint={files.length > 1 ? "Goes on all of them. Optional." : "Optional."} value={caption} onChange={(event) => setCaption(event.target.value)} />

      <Alert variant="error">{error}</Alert>
      <FormActions>
        <Button type="button" variant="outline" size="lg" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="lg" disabled={busy}>
          {busy ? "Saving…" : `Save ${files.length === 1 ? "photo" : `${files.length} photos`}`}
        </Button>
      </FormActions>
    </form>
  );
}
