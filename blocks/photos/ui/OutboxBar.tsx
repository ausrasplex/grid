"use client";

// "3 photos waiting for signal": shows what's still on the phone.

import { Button, Icon, cn } from "@grid/ui";
import { discard, retryFailed } from "./outbox";
import { useOutbox } from "./useOutbox";

export function OutboxBar({ projectId, className }: { projectId?: string; className?: string }) {
  const { waiting, failed, uploading, online } = useOutbox(projectId);
  if (!waiting && !failed.length) return null;
  const photoCount = (count: number) => `${count} photo${count === 1 ? "" : "s"}`;
  return (
    <div role="status" className={cn("flex flex-col gap-2 rounded-xl bg-muted p-3 text-sm", className)}>
      {waiting > 0 && (
        <p className="flex items-center gap-2 font-semibold">
          <Icon name={uploading ? "arrow-up" : "camera"} className={cn("size-5", uploading && "animate-pulse")} />
          {uploading ? `Uploading ${photoCount(waiting)}…` : online ? `${photoCount(waiting)} waiting to upload` : `${photoCount(waiting)} saved on this phone, waiting for signal`}
        </p>
      )}
      {failed.map((item) => (
        <div key={item.id} className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 flex-1 text-destructive">
            A photo for {item.jobName} couldn't be saved: {item.error}
          </span>
          <Button size="sm" variant="outline" onClick={() => retryFailed()}>
            Try again
          </Button>
          <Button size="sm" variant="ghost" onClick={() => discard(item.id)}>
            Remove
          </Button>
        </div>
      ))}
    </div>
  );
}
