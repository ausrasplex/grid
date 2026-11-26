// Public API for blocks that depend on "projects" (photos, plans, quotes…).
export { jobsToPurge } from "./delete";
export {
  getProject,
  createProject,
  createQuotingJob,
  canSeeJob,
  jobLabelsForSystem,
  jobsAt,
  myActiveJobs,
  activeJobCounts,
  onSiteNow,
  resumeOnSite,
  recordArea,
  areasOf,
  covers,
  search,
  isJobArchived,
  archivedJobIds,
  type JobView,
  type JobSummary,
  type Area,
  type SearchResult,
} from "./service";

/** What a block's "job.top" panel receives: the top of a job page, for the whole job (the checklist). */
export interface JobTopPanelProps {
  job: { id: string; name: string; status: string; archived: boolean };
}

/** What a block's "job.area" panel receives (photos, plans… on a job page). */
export interface JobAreaPanelProps {
  job: { id: string; name: string; status: "ACTIVE" | "COMPLETED" | "QUOTING" | "NOT_WON"; siteId: string };
  /** The work area being viewed, or null for the whole job. */
  area: import("./service").Area | null;
  areas: import("./service").Area[];
  singleArea: boolean;
}

/**
 * Props for the "place.start" panel slot: the section on an empty building
 * or floor ("Nothing here yet: Add job / Add quote"). Other Blocks add their
 * own start button for this exact place (Quotes adds "Add quote").
 */
export interface PlaceStartPanelProps {
  siteId: string;
  buildingId: string;
  /** A floor, or null for the whole building. */
  levelId: string | null;
  /** "Level 3 · Building A", or "Building A". */
  place: string;
}

/** Event payloads. */
export interface ProjectEvent {
  projectId: string;
  siteId: string;
}

/** "projects.archived" and "projects.restored" (phase 2e): drop or redraw your viewing copies for the job. */
export interface ProjectArchiveEvent extends ProjectEvent {
  companyId: string;
}
