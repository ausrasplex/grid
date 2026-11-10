// Public API for blocks that depend on "projects" (photos, plans, quotes…).
export {
  getProject,
  createProject,
  canSeeJob,
  jobLabelsForSystem,
  jobsAt,
  myActiveJobs,
  onSiteNow,
  resumeOnSite,
  recordArea,
  areasOf,
  covers,
  search,
  type JobView,
  type JobSummary,
  type Area,
  type SearchResult,
} from "./service";

/** What a block's "job.area" panel receives (photos, plans… on a job page). */
export interface JobAreaPanelProps {
  job: { id: string; name: string; status: "ACTIVE" | "COMPLETED"; siteId: string };
  /** The work area being viewed, or null for the whole job. */
  area: import("./service").Area | null;
  areas: import("./service").Area[];
  singleArea: boolean;
}

/** Event payloads. */
export interface ProjectEvent {
  projectId: string;
  siteId: string;
}
