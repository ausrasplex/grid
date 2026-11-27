// Contact cards as .vcf files (vCard): writing one to share a person, and
// reading them back in to import (docs/quotations-block.md "Contact files").
// No imports, so it runs on the phone and the server, and is unit-tested.
//
// Writing uses vCard 3.0, which iPhones, Android, Outlook and Gmail all
// open. Reading takes 2.1 (older Android), 3.0 and 4.0, and any number of
// contacts in one file.

import { emptyAddress, formatAddress, parseAddress, shortState } from "@grid/core";
import { COLUMNS, PICTURE_COLUMNS } from "./transfer.ts";

/** ADR's parts: PO box; extended; street; town; state; postcode; country. Grid's one line is made from parts, so it splits cleanly. */
function addressParts(line: string): string {
  const address = parseAddress(line);
  return ["", "", address.street, address.suburb, address.state, address.postcode, address.country].map(escapeText).join(";");
}

/** One contact to write. */
export interface VCardContact {
  name: string;
  role?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  business?: { name: string; phone?: string | null; email?: string | null; address?: string | null } | null;
  /** A JPEG to put inside the card. */
  photo?: Uint8Array | null;
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

/** Text in a vCard: backslashes, commas, semicolons and new lines are written with a backslash. */
const escapeText = (value: string) => value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/\r/g, "").replace(/,/g, "\\,").replace(/;/g, "\\;");

/** Long lines are folded at 75 characters: a line break, then a space (the standard). */
function fold(line: string): string {
  const parts: string[] = [];
  let rest = line;
  let first = true;
  while (rest.length > (first ? 75 : 74)) {
    let cut = first ? 75 : 74;
    // Don't split a character that's two halves (emoji and some letters).
    const code = rest.charCodeAt(cut - 1);
    if (code >= 0xd800 && code <= 0xdbff) cut--;
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut);
    first = false;
  }
  parts.push(rest);
  return parts.join("\r\n ");
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

/** "Steve Serci" → family name "Serci", given name "Steve" (the last word is the family name). */
function splitName(name: string): { family: string; given: string } {
  const words = name.trim().split(/\s+/);
  if (words.length < 2) return { family: "", given: words[0] ?? "" };
  return { family: words[words.length - 1]!, given: words.slice(0, -1).join(" ") };
}

/** One contact as a .vcf file's text. */
export function toVCard(contact: VCardContact): string {
  const { family, given } = splitName(contact.name);
  const lines = ["BEGIN:VCARD", "VERSION:3.0", `FN:${escapeText(contact.name)}`, `N:${escapeText(family)};${escapeText(given)};;;`];
  if (contact.business?.name) lines.push(`ORG:${escapeText(contact.business.name)}`);
  if (contact.role) lines.push(`TITLE:${escapeText(contact.role)}`);
  if (contact.phone) lines.push(`TEL;TYPE=CELL:${escapeText(contact.phone)}`);
  if (contact.business?.phone && contact.business.phone !== contact.phone) lines.push(`TEL;TYPE=WORK,VOICE:${escapeText(contact.business.phone)}`);
  if (contact.email) lines.push(`EMAIL;TYPE=INTERNET:${escapeText(contact.email)}`);
  if (contact.business?.email && contact.business.email !== contact.email) lines.push(`EMAIL;TYPE=INTERNET,WORK:${escapeText(contact.business.email)}`);
  // Addresses go in their parts, so phones file them properly.
  if (contact.address) lines.push(`ADR;TYPE=HOME:${addressParts(contact.address)}`);
  if (contact.business?.address && contact.business.address !== contact.address) lines.push(`ADR;TYPE=WORK:${addressParts(contact.business.address)}`);
  if (contact.notes) lines.push(`NOTE:${escapeText(contact.notes)}`);
  if (contact.photo?.length) lines.push(`PHOTO;ENCODING=b;TYPE=JPEG:${toBase64(contact.photo)}`);
  lines.push("END:VCARD");
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** A name that's fine as a file name: "Steve Serci.vcf". */
export const vcardFileName = (name: string) => `${name.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "Contact"}.vcf`;

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

interface Property {
  name: string;
  /** Upper-cased parameter names, values as written ("TYPE" → ["CELL", "VOICE"]). */
  params: Map<string, string[]>;
  value: string;
}

/** A contact read from a file. */
export interface ReadContact {
  name: string;
  business: string | null;
  role: string | null;
  phone: string | null;
  businessPhone: string | null;
  email: string | null;
  address: string | null;
  businessAddress: string | null;
  notes: string | null;
  photo: Uint8Array | null;
}

/** Undoes the backslashes (\n, \, \; \\). */
const unescapeText = (value: string) => value.replace(/\\([nN,;:\\])/g, (_, character: string) => (character === "n" || character === "N" ? "\n" : character));

/** Splits on a character that isn't backslashed (ORG, N and ADR have parts). */
function splitParts(value: string, separator: ";" | ","): string[] {
  const parts: string[] = [];
  let current = "";
  for (let index = 0; index < value.length; index++) {
    const character = value[index]!;
    if (character === "\\" && index + 1 < value.length) {
      current += character + value[index + 1];
      index++;
    } else if (character === separator) {
      parts.push(current);
      current = "";
    } else current += character;
  }
  parts.push(current);
  return parts;
}

function fromBase64(text: string): Uint8Array | null {
  try {
    const binary = atob(text.replace(/\s+/g, ""));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch {
    return null;
  }
}

/** vCard 2.1's quoted-printable ("=C3=A9" is é in UTF-8). */
function decodeQuotedPrintable(value: string): string {
  const bytes: number[] = [];
  for (let index = 0; index < value.length; index++) {
    const character = value[index]!;
    if (character === "=" && /^[0-9A-Fa-f]{2}$/.test(value.slice(index + 1, index + 3))) {
      bytes.push(parseInt(value.slice(index + 1, index + 3), 16));
      index += 2;
    } else {
      const encoded = new TextEncoder().encode(character);
      bytes.push(...encoded);
    }
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

/** The lines of a file, with folded lines put back together. */
function unfold(text: string): string[] {
  const raw = text.replace(/\r\n?/g, "\n").split("\n");
  const lines: string[] = [];
  for (const line of raw) {
    const previous = lines.length - 1;
    const softBreak = previous >= 0 && /ENCODING=QUOTED-PRINTABLE/i.test(lines[previous]!.split(":")[0]!) && lines[previous]!.endsWith("=");
    if ((line.startsWith(" ") || line.startsWith("\t")) && previous >= 0) {
      // Folded: the line carries on (a quoted-printable "=" at the end goes too).
      lines[previous] = (softBreak ? lines[previous]!.slice(0, -1) : lines[previous]!) + line.slice(1);
    } else if (previous >= 0 && /ENCODING=QUOTED-PRINTABLE/i.test(lines[previous]!.split(":")[0]!) && lines[previous]!.endsWith("=")) {
      // 2.1 quoted-printable carries on after a line ending in "=".
      lines[previous] = lines[previous]!.slice(0, -1) + line;
    } else lines.push(line);
  }
  return lines;
}

function parseLine(line: string): Property | null {
  // NAME;PARAM=VALUE;PARAM:value — the first colon not inside quotes ends the name part.
  let inQuotes = false;
  let colon = -1;
  for (let index = 0; index < line.length; index++) {
    if (line[index] === '"') inQuotes = !inQuotes;
    else if (line[index] === ":" && !inQuotes) {
      colon = index;
      break;
    }
  }
  if (colon < 0) return null;
  const [rawName, ...rawParams] = line.slice(0, colon).split(";");
  // "item1.TEL" (Apple's groups): the name is after the dot.
  const name = rawName!.split(".").pop()!.toUpperCase();
  const params = new Map<string, string[]>();
  for (const param of rawParams) {
    const equals = param.indexOf("=");
    // 2.1 writes bare types: "TEL;CELL;VOICE:".
    const key = equals < 0 ? "TYPE" : param.slice(0, equals).toUpperCase();
    const values = (equals < 0 ? param : param.slice(equals + 1)).replace(/"/g, "").split(",").map((value) => value.trim()).filter(Boolean);
    params.set(key, [...(params.get(key) ?? []), ...values]);
  }
  let value = line.slice(colon + 1);
  if ((params.get("ENCODING") ?? []).some((encoding) => encoding.toUpperCase() === "QUOTED-PRINTABLE")) value = decodeQuotedPrintable(value);
  return { name, params, value };
}

const hasType = (property: Property, ...types: string[]) => (property.params.get("TYPE") ?? []).some((type) => types.includes(type.toUpperCase()));
const tidy = (value: string | undefined | null) => {
  const trimmed = (value ?? "").replace(/\s+\n/g, "\n").trim();
  return trimmed ? trimmed : null;
};
/** ADR parts (PO box; extended; street; town; state; postcode; country) as Grid's one line ("12 Smith St, Brunswick VIC 3056"). */
const addressLine = (value: string) => {
  const parts = splitParts(value, ";").map((part) => unescapeText(part).replace(/\n/g, ", ").trim());
  const [poBox = "", extended = "", street = "", suburb = "", state = "", postcode = "", country = ""] = parts;
  // Some phones put the whole address in the street part: split that up instead.
  if (!suburb && !state && !postcode) return tidy(formatAddress(parseAddress([poBox, extended, street, country].filter(Boolean).join(", "))));
  return tidy(formatAddress({ ...emptyAddress, street: [poBox, extended, street].filter(Boolean).join(", "), suburb, state: shortState(state), postcode, country }));
};

function photoOf(property: Property): Uint8Array | null {
  const value = property.value.trim();
  // vCard 4.0: a data address.
  const dataMatch = /^data:[^;,]*;base64,(.*)$/is.exec(value);
  if (dataMatch) return fromBase64(dataMatch[1]!);
  const encoding = (property.params.get("ENCODING") ?? []).map((encoded) => encoded.toUpperCase());
  if (encoding.includes("B") || encoding.includes("BASE64")) return fromBase64(value);
  // A web address: not fetched.
  return null;
}

/** Every contact in a .vcf file. */
export function readVCards(text: string): ReadContact[] {
  const contacts: ReadContact[] = [];
  let properties: Property[] | null = null;
  for (const line of unfold(text)) {
    const upper = line.trim().toUpperCase();
    if (upper === "BEGIN:VCARD") {
      properties = [];
      continue;
    }
    if (upper === "END:VCARD") {
      if (properties) {
        const contact = toContact(properties);
        if (contact) contacts.push(contact);
      }
      properties = null;
      continue;
    }
    if (!properties || !line.trim()) continue;
    const property = parseLine(line);
    if (property) properties.push(property);
  }
  return contacts;
}

function toContact(properties: Property[]): ReadContact | null {
  const first = (name: string, matches: (property: Property) => boolean = () => true) => properties.find((property) => property.name === name && matches(property));
  const text = (property: Property | undefined) => (property ? tidy(unescapeText(property.value)) : null);

  const structured = first("N");
  const nameParts = structured ? splitParts(structured.value, ";").map((part) => unescapeText(part).trim()) : [];
  // N is family; given; middle; prefix; suffix.
  const fromParts = [nameParts[3], nameParts[1], nameParts[2], nameParts[0], nameParts[4]].filter(Boolean).join(" ");
  const organisation = first("ORG");
  const business = organisation ? tidy(unescapeText(splitParts(organisation.value, ";")[0] ?? "")) : null;
  const name = text(first("FN")) ?? tidy(fromParts) ?? business;
  if (!name) return null;

  const phones = properties.filter((property) => property.name === "TEL");
  const mobile = phones.find((property) => hasType(property, "CELL", "MOBILE", "IPHONE"));
  const work = phones.find((property) => property !== mobile && hasType(property, "WORK"));
  const phone = mobile ?? phones.find((property) => property !== work) ?? null;
  const addresses = properties.filter((property) => property.name === "ADR");
  const workAddress = addresses.find((property) => hasType(property, "WORK"));
  const homeAddress = addresses.find((property) => property !== workAddress);
  const photo = first("PHOTO");

  return {
    name,
    // Someone whose card is only a business name isn't a person at it.
    business: business && business !== name ? business : null,
    role: text(first("TITLE")) ?? text(first("ROLE")),
    phone: phone ? tidy(phone.value.replace(/^tel:/i, "")) : null,
    businessPhone: work && phone !== work ? tidy(work.value.replace(/^tel:/i, "")) : null,
    email: text(first("EMAIL")),
    address: homeAddress ? addressLine(homeAddress.value) : !business && workAddress ? addressLine(workAddress.value) : null,
    businessAddress: business && workAddress ? addressLine(workAddress.value) : null,
    notes: text(first("NOTE")),
    photo: photo ? photoOf(photo) : null,
  };
}

/**
 * Contacts as the import's table (the same columns as a zip from Grid),
 * with their photos named "photos/1.jpg"… so the import handles them like
 * any other file.
 */
export function vcardsToTable(contacts: ReadContact[]): { cells: string[][]; pictures: Map<string, Uint8Array> } {
  const pictures = new Map<string, Uint8Array>();
  const cells: string[][] = [[...COLUMNS, ...PICTURE_COLUMNS]];
  contacts.forEach((contact, index) => {
    const pictureName = contact.photo ? `photos/${index + 1}.jpg` : "";
    if (contact.photo) pictures.set(pictureName, contact.photo);
    // Business, Business ABN, Business phone, Business email, Business address, Business notes,
    // Name, Role, Contact name, Phone, Email, Address, ABN, Notes, Business picture, Picture.
    cells.push([
      contact.business ?? "",
      "",
      contact.business ? (contact.businessPhone ?? "") : "",
      "",
      contact.business ? (contact.businessAddress ?? "") : "",
      "",
      contact.name,
      contact.role ?? "",
      "",
      contact.phone ?? (contact.business ? "" : (contact.businessPhone ?? "")),
      contact.email ?? "",
      contact.address ?? "",
      "",
      contact.notes ?? "",
      "",
      pictureName,
    ]);
  });
  return { cells, pictures };
}
