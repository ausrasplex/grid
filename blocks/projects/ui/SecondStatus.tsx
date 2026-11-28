// A job's second status as a small chip ("Scheduled", "To be booked"),
// shown after Active. Works on server and client pages (no hooks).
import type { JobSecondStatus } from "@grid/core";
import { cn } from "@grid/ui";

const TONE: Record<JobSecondStatus["tone"], string> = {
  default: "border-transparent bg-primary/15 text-foreground",
  warning: "border-transparent bg-warning/20 text-foreground",
  muted: "border-transparent bg-muted text-muted-foreground",
};

/** "Scheduled" (with "Active •" when asked: on its own, like the job page). */
export function SecondStatus({ status, withActive = false, withHint = false, className }: { status: JobSecondStatus; withActive?: boolean; withHint?: boolean; className?: string }) {
  return (
    <span
      title={[`Active • ${status.label}`, status.hint].filter(Boolean).join(" · ")}
      className={cn("inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap", TONE[status.tone], className)}
    >
      {withActive ? `Active • ${status.label}` : status.label}
      {withHint && status.hint ? <span className="ml-1 font-normal opacity-80">· {status.hint}</span> : null}
    </span>
  );
}
