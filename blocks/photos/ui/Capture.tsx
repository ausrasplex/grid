"use client";

// The centre button for a sole trader: Take a photo (docs/navigation.md §5a).
// Opens the camera, then files the photos against the job you're on, or the
// one you used last, with a one-tap change of job.

import { useRef, useState } from "react";
import { Button, EmptyState, Icon, PageHeader, Section, Stack } from "@grid/ui";
import { AddPhotos, type JobOpt } from "./AddPhotos";
import type { AreaOpt } from "./areas";
import { OutboxBar } from "./OutboxBar";

interface Props {
  job: JobOpt | null;
  areas: AreaOpt[];
  lastArea: { buildingId: string; levelId: string | null } | null;
  jobs: JobOpt[];
}

export function Capture({ job, areas, lastArea, jobs }: Props) {
  const [files, setFiles] = useState<File[] | null>(null);
  const [savedOffline, setSavedOffline] = useState(0);
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);

  const pick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])];
    if (files.length) setFiles(files);
    event.target.value = "";
  };

  if (!job) {
    return (
      <>
        <PageHeader title="Take a photo" />
        <Section>
          <EmptyState title="Start a job first">Photos are filed against a job, so they're easy to find later.</EmptyState>
          <Button asChild size="lg" block>
            <a href="/b/projects/new">New job</a>
          </Button>
        </Section>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Take a photo" meta={files ? undefined : `For ${job.name}`} />
      <Stack>
        <OutboxBar />
        {files ? (
          <Section>
            <AddPhotos
              files={files}
              job={job}
              areas={areas}
              defaultArea={lastArea}
              jobs={jobs}
              onSaved={(jobId, area) => {
                // No signal: the job page can't load, so stay here ready for the next one.
                if (!navigator.onLine) {
                  setSavedOffline((currentSavedOffline) => currentSavedOffline + files.length);
                  setFiles(null);
                  return;
                }
                window.location.href = area ? `/b/projects/${jobId}/area/${area.buildingId}${area.levelId ? `/${area.levelId}` : ""}` : `/b/projects/${jobId}`;
              }}
              onCancel={() => setFiles(null)}
            />
          </Section>
        ) : (
          <>
            {savedOffline > 0 && (
              <p role="status" className="rounded-xl bg-accent p-3 font-semibold text-accent-foreground">
                Saved {savedOffline} photo{savedOffline === 1 ? "" : "s"} on this phone. They'll upload when you have signal.
              </p>
            )}
            <button
              type="button"
              onClick={() => camera.current?.click()}
              className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-3 rounded-2xl bg-primary text-primary-foreground active:opacity-90 sm:aspect-[16/7]"
            >
              <Icon name="camera" className="size-16" />
              <span className="text-xl font-bold">Open camera</span>
            </button>
            <Button variant="outline" size="lg" block onClick={() => library.current?.click()}>
              Choose from your photos
            </Button>
            <p className="text-center text-sm text-muted-foreground">No signal? Take them anyway. They save on this phone and upload when you're back in range.</p>
          </>
        )}
        <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={pick} />
        <input ref={library} type="file" accept="image/*" multiple hidden onChange={pick} />
      </Stack>
    </>
  );
}
