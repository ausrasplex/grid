// Plain-English lines for the Activity log: "Deleted a site note", "Lockbox".

/** Plain words for the things Blocks record. */
const THINGS: Record<string, string> = {
  Project: "job",
  ProjectCover: "job's areas",
  Company: "business",
  Membership: "member",
  PhotoComment: "photo note",
  JobPhoto: "photo",
  JobNote: "note",
  PlanSheet: "plan sheet",
  LibraryDocument: "document",
  DocumentLibrary: "document library",
  DocumentSettings: "document settings",
  JobDocumentFolder: "job document folder",
  DocumentLink: "document pinned to a job",
  PlanVersion: "plan revision",
  PlanMarkup: "markup",
  PlanScale: "plan scale",
  SiteNote: "site note",
  User: "account",
  StoredFile: "file",
  PriceItem: "price book item",
  PriceBrand: "price book brand",
  TaxCode: "tax code",
  SignRequest: "signing link",
  QuoteUserSettings: "quote screen setting",
  ServerSetting: "server setting",
};

/** Actions that read as "<did> a <thing>". Anything else reads "<Thing>: <action words>". */
const VERBS: Record<string, string> = {
  created: "Added",
  added: "Added",
  updated: "Changed",
  updated_with_covers: "Changed",
  deleted: "Deleted",
  removed: "Removed",
  restored: "Restored",
  renamed: "Renamed",
  moved: "Moved",
  invited: "Invited",
  sent: "Sent",
  accepted: "Accepted",
  declined: "Declined",
  withdrawn: "Withdrew",
  completed: "Finished",
  reopened: "Reopened",
  archived: "Archived",
  converted: "Converted",
};

const words = (value: string) => value.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
const thingName = (entityType: string) => THINGS[entityType] ?? words(entityType);
export const capital = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

export function summaryOf(entityType: string, action: string): string {
  const thing = thingName(entityType);
  const verb = VERBS[action];
  if (verb) return `${verb} ${/^[aeiou]/.test(thing) ? "an" : "a"} ${thing}`;
  return `${capital(thing)}: ${words(action)}`;
}

/** A name from the recorded details, if there's an obvious one. */
export function whatOf(diff: unknown): string | null {
  if (!diff || typeof diff !== "object" || Array.isArray(diff)) return null;
  const record = diff as Record<string, unknown>;
  for (const key of ["title", "name", "number", "caption", "label", "to"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim().slice(0, 80);
  }
  const before = record.before;
  if (before && typeof before === "object" && !Array.isArray(before)) return whatOf(before);
  return null;
}
