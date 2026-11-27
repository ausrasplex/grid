// Clients export and import: the spreadsheet layout, reading a file back
// in, and matching what's in it against the Clients list so nothing is
// doubled up. No imports, so it runs anywhere and is unit-tested
// (docs/quotations-block.md "Export and import").
//
// These are contact cards only: a row never carries an account, a member
// or a permission.

/** The columns, in order. The same layout for export, import and Share our card. */
export const COLUMNS = [
  "Business",
  "Business ABN",
  "Business phone",
  "Business email",
  "Business address",
  "Business notes",
  "Name",
  "Role",
  "Contact name",
  "Phone",
  "Email",
  "Address",
  "ABN",
  "Notes",
] as const;

/**
 * In a zip (spreadsheet plus a pictures folder), two more columns name each
 * row's pictures: "pictures/siemens.jpg". A plain spreadsheet has neither.
 */
export const PICTURE_COLUMNS = ["Business picture", "Picture"] as const;

export interface BusinessFields {
  name: string;
  abn: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
}

export interface PersonFields {
  name: string;
  role: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  abn: string | null;
  notes: string | null;
}

/** A business on the list, for export and matching. */
export interface BusinessCard extends BusinessFields {
  id: string;
  /** Exporting: its picture's name in the zip. Matching: whether it has one (any text). */
  picture?: string | null;
}

/** A person on the list, for export and matching. */
export interface PersonCard extends PersonFields {
  id: string;
  businessId: string | null;
  /** Exporting: their photo's name in the zip. Matching: whether they have one (any text). */
  picture?: string | null;
}

const BUSINESS_KEYS = ["name", "abn", "phone", "email", "address", "notes"] as const satisfies readonly (keyof BusinessFields)[];
const PERSON_KEYS = ["name", "role", "contactName", "phone", "email", "address", "abn", "notes"] as const satisfies readonly (keyof PersonFields)[];

const text = (value: string | null | undefined) => value ?? "";

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/**
 * The list as a table, headings first: one row per person with their
 * business alongside, and a row of its own for a business with nobody at it.
 * Sorted by business (or the person's name when they have none), then name.
 */
export function toTable(businesses: BusinessCard[], people: PersonCard[], options: { pictures?: boolean } = {}): string[][] {
  const businessesById = new Map(businesses.map((business) => [business.id, business]));
  const withPeople = new Set<string>();
  const rows: { sortKey: string; personName: string; cells: string[] }[] = [];
  const businessCells = (business: BusinessFields | undefined) =>
    business ? [business.name, text(business.abn), text(business.phone), text(business.email), text(business.address), text(business.notes)] : ["", "", "", "", "", ""];

  for (const person of people) {
    const business = person.businessId ? businessesById.get(person.businessId) : undefined;
    if (business) withPeople.add(business.id);
    rows.push({
      sortKey: (business?.name ?? person.name).toLowerCase(),
      personName: person.name.toLowerCase(),
      cells: [
        ...businessCells(business),
        person.name,
        text(person.role),
        text(person.contactName),
        text(person.phone),
        text(person.email),
        text(person.address),
        text(person.abn),
        text(person.notes),
        ...(options.pictures ? [text(business?.picture), text(person.picture)] : []),
      ],
    });
  }
  for (const business of businesses) {
    if (withPeople.has(business.id)) continue;
    rows.push({ sortKey: business.name.toLowerCase(), personName: "", cells: [...businessCells(business), "", "", "", "", "", "", "", "", ...(options.pictures ? [text(business.picture), ""] : [])] });
  }
  rows.sort((first, second) => first.sortKey.localeCompare(second.sortKey) || first.personName.localeCompare(second.personName));
  return [[...COLUMNS, ...(options.pictures ? PICTURE_COLUMNS : [])], ...rows.map((row) => row.cells)];
}

// ---------------------------------------------------------------------------
// Reading a file back in
// ---------------------------------------------------------------------------

type Field =
  | `business.${keyof BusinessFields}`
  | `person.${keyof PersonFields}`
  | "person.firstName"
  | "person.lastName"
  | "business.picture"
  | "person.picture";

/** Column headings Grid understands, squashed (lower case, letters and digits only). */
const HEADINGS: Record<string, Field> = {
  business: "business.name",
  businessname: "business.name",
  company: "business.name",
  companyname: "business.name",
  organisation: "business.name",
  organization: "business.name",
  employer: "business.name",
  businessabn: "business.abn",
  companyabn: "business.abn",
  businessphone: "business.phone",
  companyphone: "business.phone",
  officephone: "business.phone",
  businessemail: "business.email",
  companyemail: "business.email",
  officeemail: "business.email",
  businessaddress: "business.address",
  companyaddress: "business.address",
  officeaddress: "business.address",
  businessnotes: "business.notes",
  companynotes: "business.notes",
  businesspicture: "business.picture",
  businesslogo: "business.picture",
  companylogo: "business.picture",
  logo: "business.picture",
  picture: "person.picture",
  photo: "person.picture",
  name: "person.name",
  fullname: "person.name",
  person: "person.name",
  clientname: "person.name",
  customername: "person.name",
  displayname: "person.name",
  firstname: "person.firstName",
  givenname: "person.firstName",
  lastname: "person.lastName",
  surname: "person.lastName",
  familyname: "person.lastName",
  role: "person.role",
  jobtitle: "person.role",
  position: "person.role",
  contactname: "person.contactName",
  phone: "person.phone",
  phonenumber: "person.phone",
  mobile: "person.phone",
  mobilephone: "person.phone",
  mobilenumber: "person.phone",
  cell: "person.phone",
  telephone: "person.phone",
  tel: "person.phone",
  email: "person.email",
  emailaddress: "person.email",
  address: "person.address",
  streetaddress: "person.address",
  homeaddress: "person.address",
  siteaddress: "person.address",
  abn: "person.abn",
  notes: "person.notes",
  note: "person.notes",
  comments: "person.notes",
};

const squash = (heading: string) => heading.toLowerCase().replace(/[^a-z0-9]/g, "");

/** One usable row of the file. `line` is its row number in the file (1 = headings). */
export interface ReadRow {
  line: number;
  business: BusinessFields | null;
  person: PersonFields | null;
  /** Picture names from a zip's picture columns ("pictures/siemens.jpg"), or null. */
  businessPicture?: string | null;
  personPicture?: string | null;
}

export interface SkippedRow {
  line: number;
  reason: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const cellText = (value: unknown) => (value === null || value === undefined ? "" : String(value).trim());
const orNull = (value: string) => (value ? value : null);

/**
 * Reads a table (the first sheet of a CSV or Excel file): the first row
 * with anything in it is the headings. Columns Grid doesn't know are ignored.
 */
export function readTable(cells: unknown[][]): { rows: ReadRow[]; skipped: SkippedRow[]; columnsFound: string[] } {
  const headingIndex = cells.findIndex((row) => row.some((cell) => cellText(cell)));
  if (headingIndex < 0) return { rows: [], skipped: [], columnsFound: [] };
  const fields = new Map<number, Field>();
  const columnsFound: string[] = [];
  cells[headingIndex]!.forEach((heading, index) => {
    const field = HEADINGS[squash(cellText(heading))];
    // The first column for a field wins (a second "Phone" is ignored).
    if (field && ![...fields.values()].includes(field)) {
      fields.set(index, field);
      columnsFound.push(cellText(heading));
    }
  });
  const hasBusinessAbn = [...fields.values()].includes("business.abn");

  const rows: ReadRow[] = [];
  const skipped: SkippedRow[] = [];
  cells.slice(headingIndex + 1).forEach((row, offset) => {
    const line = headingIndex + offset + 2;
    const values: Partial<Record<Field, string>> = {};
    for (const [index, field] of fields) values[field] = cellText(row[index]);
    if (!Object.values(values).some(Boolean)) return; // An empty row: nothing to say.

    const businessName = values["business.name"] ?? "";
    const personName = values["person.name"] || [values["person.firstName"], values["person.lastName"]].filter(Boolean).join(" ");
    if (!businessName && !personName) {
      skipped.push({ line, reason: "No name or business" });
      return;
    }
    // With no Business ABN column, an ABN on a row with a business is the business's.
    const abnIsBusiness = !hasBusinessAbn && !!businessName;
    const business: BusinessFields | null = businessName
      ? {
          name: businessName,
          abn: orNull(abnIsBusiness ? (values["person.abn"] ?? "") : (values["business.abn"] ?? "")),
          phone: orNull(values["business.phone"] ?? ""),
          email: orNull(values["business.email"] ?? ""),
          address: orNull(values["business.address"] ?? ""),
          notes: orNull(values["business.notes"] ?? ""),
        }
      : null;
    const person: PersonFields | null = personName
      ? {
          name: personName,
          role: orNull(values["person.role"] ?? ""),
          contactName: orNull(values["person.contactName"] ?? ""),
          phone: orNull(values["person.phone"] ?? ""),
          email: orNull(values["person.email"] ?? ""),
          address: orNull(values["person.address"] ?? ""),
          abn: orNull(abnIsBusiness ? "" : (values["person.abn"] ?? "")),
          notes: orNull(values["person.notes"] ?? ""),
        }
      : null;
    const badEmail = [business?.email, person?.email].find((email) => email && !EMAIL.test(email));
    if (badEmail) {
      skipped.push({ line, reason: `Check the email address (${badEmail})` });
      return;
    }
    rows.push({
      line,
      business,
      person,
      businessPicture: business ? orNull(values["business.picture"] ?? "") : null,
      personPicture: person ? orNull(values["person.picture"] ?? "") : null,
    });
  });
  return { rows, skipped, columnsFound };
}

// ---------------------------------------------------------------------------
// Matching against the list
// ---------------------------------------------------------------------------

/** ABN digits only, so "11 222 333 444" and "11222333444" match. Too short to be one: null. */
export const abnKey = (abn: string | null | undefined) => {
  const digits = (abn ?? "").replace(/\D/g, "");
  return digits.length >= 9 ? digits : null;
};

/** A business name for matching: case, spacing, full stops and "Pty Ltd" / "Ltd" / "Limited" don't count. */
export const businessNameKey = (name: string) =>
  name
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .replace(/\b(pty|proprietary|ltd|limited|inc|co)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** A person's name for matching: case and spacing don't count. */
export const personNameKey = (name: string) => name.toLowerCase().replace(/\s+/g, " ").trim();
const emailKey = (email: string | null | undefined) => (email ? email.trim().toLowerCase() : null);

export interface FieldChange {
  field: string;
  label: string;
  from: string | null;
  to: string;
}

const LABELS: Record<string, string> = {
  name: "Name",
  abn: "ABN",
  phone: "Phone",
  email: "Email",
  address: "Address",
  notes: "Notes",
  role: "Role",
  contactName: "Contact name",
};

/** What the file would change: only fields it has something in (a blank never clears). */
function changesOf<T extends object>(keys: readonly (keyof T & string)[], existing: T, incoming: T): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const key of keys) {
    const to = incoming[key] as string | null;
    const from = existing[key] as string | null;
    if (!to) continue;
    const same = key === "email" ? emailKey(to) === emailKey(from) : key === "abn" ? abnKey(to) === abnKey(from) && !!abnKey(to) : to.trim() === (from ?? "").trim();
    if (!same) changes.push({ field: key, label: LABELS[key] ?? key, from, to });
  }
  return changes;
}

/** Fills the gaps in `into` from `from` (the first row with something wins). */
function fillGaps<T extends object>(keys: readonly (keyof T & string)[], into: T, from: T) {
  for (const key of keys) if (!into[key] && from[key]) (into as Record<string, unknown>)[key] = from[key];
}

export type Decision = "add" | "update" | "skip";

export interface PlannedBusiness {
  /** Stable for the same file: decisions are sent back keyed by it. */
  key: string;
  fields: BusinessFields;
  /** Its picture's name in the zip, when the zip has it. */
  picture: string | null;
  /** The business on the list it's the same as, or null for a new one. */
  match: { id: string; name: string; by: "abn" | "name" } | null;
  changes: FieldChange[];
  /** What happens if you don't choose: add a new one, skip a match. */
  suggested: Decision;
  lines: number[];
}

export interface PlannedPerson {
  key: string;
  businessKey: string | null;
  fields: PersonFields;
  /** Their photo's name in the zip, when the zip has it. */
  picture: string | null;
  match: { id: string; name: string; by: "email" | "name"; businessId: string | null } | null;
  changes: FieldChange[];
  /** Matched by email at a different business: Update moves them to this one. */
  movesBusiness: boolean;
  suggested: Decision;
  lines: number[];
}

export interface ImportPlan {
  businesses: PlannedBusiness[];
  people: PlannedPerson[];
  skipped: SkippedRow[];
}

/**
 * Works out what a file would do to the list. Businesses match by ABN, then
 * name; people by email, then name at the same business. The same business
 * (or person) on several rows of the file is one.
 */
export function planImport(
  rows: ReadRow[],
  existing: { businesses: BusinessCard[]; people: PersonCard[] },
  skipped: SkippedRow[] = [],
  /** The pictures in the zip, by name. A name the zip doesn't have is ignored. */
  pictureNames: Set<string> = new Set(),
): ImportPlan {
  const pictureIn = (name: string | null | undefined) => (name && pictureNames.has(name) ? name : null);
  // --- businesses in the file, merged
  const fileBusinesses = new Map<string, PlannedBusiness>();
  const byFileName = new Map<string, string>();
  const businessKeyOfRow = new Map<number, string>();
  // ABN rows first, so a row without the ABN joins the same-named business that has it.
  const ordered = [...rows].sort((first, second) => Number(!abnKey(first.business?.abn)) - Number(!abnKey(second.business?.abn)) || first.line - second.line);
  for (const row of ordered) {
    if (!row.business) continue;
    const abn = abnKey(row.business.abn);
    const nameKey = businessNameKey(row.business.name);
    const key = abn ? `abn:${abn}` : (byFileName.get(nameKey) ?? `name:${nameKey}`);
    const known = fileBusinesses.get(key);
    if (known) {
      fillGaps(BUSINESS_KEYS, known.fields, row.business);
      known.picture ??= pictureIn(row.businessPicture);
      known.lines.push(row.line);
    } else fileBusinesses.set(key, { key, fields: { ...row.business }, picture: pictureIn(row.businessPicture), match: null, changes: [], suggested: "add", lines: [row.line] });
    if (!byFileName.has(nameKey)) byFileName.set(nameKey, key);
    businessKeyOfRow.set(row.line, key);
  }

  // --- match them to the list
  const listByAbn = new Map<string, BusinessCard>();
  const listByName = new Map<string, BusinessCard>();
  for (const business of existing.businesses) {
    const abn = abnKey(business.abn);
    if (abn && !listByAbn.has(abn)) listByAbn.set(abn, business);
    const nameKey = businessNameKey(business.name);
    if (!listByName.has(nameKey)) listByName.set(nameKey, business);
  }
  for (const planned of fileBusinesses.values()) {
    const abn = abnKey(planned.fields.abn);
    const byAbn = abn ? listByAbn.get(abn) : undefined;
    const byName = byAbn ? undefined : listByName.get(businessNameKey(planned.fields.name));
    const found = byAbn ?? byName;
    if (!found) continue;
    planned.match = { id: found.id, name: found.name, by: byAbn ? "abn" : "name" };
    planned.changes = [...changesOf(BUSINESS_KEYS, found, planned.fields), ...pictureChange(found, planned.picture)];
    planned.suggested = "skip";
  }

  // --- people in the file, merged (same email, or same name at the same business)
  const people = new Map<string, PlannedPerson>();
  for (const row of [...rows].sort((first, second) => first.line - second.line)) {
    if (!row.person) continue;
    const businessKey = businessKeyOfRow.get(row.line) ?? null;
    const email = emailKey(row.person.email);
    const key = email ? `email:${email}` : `name:${businessKey ?? "-"}:${personNameKey(row.person.name)}`;
    const known = people.get(key);
    if (known) {
      fillGaps(PERSON_KEYS, known.fields, row.person);
      known.picture ??= pictureIn(row.personPicture);
      known.lines.push(row.line);
      continue;
    }
    people.set(key, { key, businessKey, fields: { ...row.person }, picture: pictureIn(row.personPicture), match: null, changes: [], movesBusiness: false, suggested: "add", lines: [row.line] });
  }

  // --- match them to the list
  const listByEmail = new Map<string, PersonCard>();
  const listByPersonName = new Map<string, PersonCard>();
  for (const person of existing.people) {
    const email = emailKey(person.email);
    if (email && !listByEmail.has(email)) listByEmail.set(email, person);
    const nameKey = `${person.businessId ?? "-"}:${personNameKey(person.name)}`;
    if (!listByPersonName.has(nameKey)) listByPersonName.set(nameKey, person);
  }
  for (const planned of people.values()) {
    const business = planned.businessKey ? fileBusinesses.get(planned.businessKey) : null;
    // Where they'd end up: the matched business, none, or a new one (unknown id yet).
    const targetBusinessId = business ? (business.match?.id ?? undefined) : null;
    const email = emailKey(planned.fields.email);
    const byEmail = email ? listByEmail.get(email) : undefined;
    const byName = byEmail || targetBusinessId === undefined ? undefined : listByPersonName.get(`${targetBusinessId ?? "-"}:${personNameKey(planned.fields.name)}`);
    const found = byEmail ?? byName;
    if (!found) continue;
    planned.match = { id: found.id, name: found.name, by: byEmail ? "email" : "name", businessId: found.businessId };
    planned.changes = [...changesOf(PERSON_KEYS, found, planned.fields), ...pictureChange(found, planned.picture)];
    // No business in the file keeps the one they're at.
    planned.movesBusiness = business ? targetBusinessId !== found.businessId : false;
    planned.suggested = "skip";
  }

  return { businesses: [...fileBusinesses.values()], people: [...people.values()], skipped };
}

/**
 * A picture in the zip counts as a change only when Grid has none: like a
 * blank cell never clearing, a picture never replaces one already there.
 */
function pictureChange(existing: { picture?: string | null }, picture: string | null): FieldChange[] {
  return picture && !existing.picture ? [{ field: "picture", label: "Picture", from: null, to: "Added from the file" }] : [];
}

/** Does this match have anything to change? A match with nothing different needs nothing. */
export const hasChanges = (planned: PlannedBusiness | PlannedPerson) => planned.changes.length > 0 || ("movesBusiness" in planned && planned.movesBusiness);

/** The fields an Update writes: only the ones the file has something in. */
export function updateFields<T extends object>(planned: { changes: FieldChange[]; fields: T }): Partial<T> {
  // The picture isn't a field: it's saved as a file on its own.
  return Object.fromEntries(planned.changes.filter((change) => change.field !== "picture").map((change) => [change.field, planned.fields[change.field as keyof T]])) as Partial<T>;
}

/** Will an Update add a picture? */
export const addsPicture = (planned: { changes: FieldChange[] }) => planned.changes.some((change) => change.field === "picture");
