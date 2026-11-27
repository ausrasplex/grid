// Addresses in parts: street, suburb, state, postcode (docs/stage-2-projects.md
// "Addresses"). Every address in Grid is kept this way so reports can count
// by suburb, and every screen shows it the same way.
//
// The full one-line address ("12 Smith St, Brunswick VIC 3056") is always
// made from the parts by formatAddress(). It's also stored next to them
// (searching, matching, PDFs), but never typed into on its own.
//
// No imports, so it's unit-tested directly.

export interface Address {
  /** Unit, number and street: "2/12 Smith St". Can also be a lot or a building name. */
  street: string;
  suburb: string;
  /** Short state name: "VIC". */
  state: string;
  postcode: string;
  /** "Australia" (left out when shown), or another country's name. */
  country: string;
  /** Google's id for the place, when it was picked from Google. */
  placeId: string | null;
  latitude: number | null;
  longitude: number | null;
}

export const emptyAddress: Address = { street: "", suburb: "", state: "", postcode: "", country: "", placeId: null, latitude: null, longitude: null };

/** Australian states and territories, short name first. */
export const AUSTRALIAN_STATES: { short: string; name: string }[] = [
  { short: "VIC", name: "Victoria" },
  { short: "NSW", name: "New South Wales" },
  { short: "QLD", name: "Queensland" },
  { short: "SA", name: "South Australia" },
  { short: "WA", name: "Western Australia" },
  { short: "TAS", name: "Tasmania" },
  { short: "NT", name: "Northern Territory" },
  { short: "ACT", name: "Australian Capital Territory" },
];

/** Words that end a street name ("Smith St"), long and short. */
const STREET_WORDS = new Set([
  "street", "st", "road", "rd", "avenue", "ave", "av", "drive", "dr", "court", "ct", "place", "pl",
  "crescent", "cres", "cr", "parade", "pde", "highway", "hwy", "lane", "ln", "terrace", "tce",
  "boulevard", "blvd", "close", "cl", "circuit", "cct", "grove", "gr", "square", "sq", "way", "wy",
  "esplanade", "esp", "parkway", "pkwy", "track", "trk", "rise", "walk", "mews", "loop", "row",
]);

const isAustralia = (country: string) => !country.trim() || /^(australia|au)$/i.test(country.trim());

/** "victoria", "Vic", "VIC." → "VIC". Anything else is kept as typed. */
export function shortState(state: string): string {
  const text = state.trim().replace(/\.$/, "");
  const found = AUSTRALIAN_STATES.find((entry) => entry.short.toLowerCase() === text.toLowerCase() || entry.name.toLowerCase() === text.toLowerCase());
  return found ? found.short : text;
}

/** True when nothing has been filled in. */
export function isEmptyAddress(address: Address): boolean {
  return !address.street.trim() && !address.suburb.trim() && !address.state.trim() && !address.postcode.trim();
}

/** The one-line address: "2/12 Smith St, Brunswick VIC 3056". */
export function formatAddress(address: Address): string {
  const area = [address.suburb.trim(), address.state.trim(), address.postcode.trim()].filter(Boolean).join(" ");
  const parts = [address.street.trim(), area];
  if (!isAustralia(address.country)) parts.push(address.country.trim());
  return parts.filter(Boolean).join(", ");
}

/** The second line on an envelope or PDF: "Brunswick VIC 3056". */
export function addressAreaLine(address: Address): string {
  return [address.suburb.trim(), address.state.trim(), address.postcode.trim()].filter(Boolean).join(" ");
}

const STATE_WORDS = AUSTRALIAN_STATES.flatMap((entry) => [entry.short, entry.name]).sort((first, second) => second.length - first.length);
const STATE_PATTERN = STATE_WORDS.map((word) => word.replace(/ /g, "\\s+")).join("|");

/**
 * Splits a typed address into its parts. Made for how Australians write
 * addresses ("12 Smith St, Brunswick VIC 3056", "12 Smith Street Brunswick
 * Victoria 3056", "Unit 2, 12 Smith St, Brunswick, VIC 3056"). When it can't
 * tell where the street ends, the suburb is left empty for the person to fill
 * in rather than guessed.
 */
export function parseAddress(text: string): Address {
  const address: Address = { ...emptyAddress };
  let rest = text.replace(/\s+/g, " ").trim();
  if (!rest) return address;

  const country = rest.match(/,\s*(australia)$/i);
  if (country) {
    address.country = "Australia";
    rest = rest.slice(0, country.index).trim();
  }

  // The end: "VIC 3056", "Victoria 3056", "3056 VIC", "VIC" or "3056".
  const stateThenPostcode = rest.match(new RegExp(`^(.*?)[,\\s]+(${STATE_PATTERN})\\.?\\s*,?\\s*(\\d{4})?$`, "i"));
  const postcodeThenState = rest.match(new RegExp(`^(.*?)[,\\s]+(\\d{4})\\s*,?\\s*(${STATE_PATTERN})\\.?$`, "i"));
  const postcodeOnly = rest.match(/^(.*?)[,\s]+(\d{4})$/);
  if (postcodeThenState && postcodeThenState[1]) {
    rest = postcodeThenState[1];
    address.postcode = postcodeThenState[2]!;
    address.state = shortState(postcodeThenState[3]!.replace(/\s+/g, " "));
  } else if (stateThenPostcode && stateThenPostcode[1]) {
    rest = stateThenPostcode[1];
    address.state = shortState(stateThenPostcode[2]!.replace(/\s+/g, " "));
    address.postcode = stateThenPostcode[3] ?? "";
  } else if (postcodeOnly && postcodeOnly[1]) {
    rest = postcodeOnly[1];
    address.postcode = postcodeOnly[2]!;
  }
  if (address.state || address.postcode) address.country ||= "Australia";

  // What's left: "12 Smith St, Brunswick" or "12 Smith St Brunswick".
  const segments = rest.split(",").map((segment) => segment.trim()).filter(Boolean);
  const foundArea = !!(address.state || address.postcode);
  if (segments.length > 1) {
    address.suburb = segments.pop()!;
    address.street = segments.join(", ");
  } else if (segments.length === 1) {
    const words = segments[0]!.split(" ");
    let streetEnd = -1;
    words.forEach((word, index) => {
      if (index > 0 && STREET_WORDS.has(word.toLowerCase().replace(/\.$/, ""))) streetEnd = index;
    });
    if (streetEnd >= 0 && streetEnd < words.length - 1 && foundArea) {
      address.street = words.slice(0, streetEnd + 1).join(" ");
      address.suburb = words.slice(streetEnd + 1).join(" ");
    } else if (foundArea && streetEnd < 0 && !/\d/.test(segments[0]!)) {
      // Just a suburb: "Brunswick VIC 3056".
      address.suburb = segments[0]!;
    } else {
      address.street = segments[0]!;
    }
  }
  return address;
}

const text = (value: unknown, limit: number) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, limit) : "");
const coordinate = (value: unknown, limit: number) => (typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= limit ? value : null);

/**
 * An address from a request: its parts ({ street, suburb, … }), or a whole
 * address as one line (imports, older apps), which is split up. Anything
 * else is an empty address.
 */
export function toAddress(value: unknown): Address {
  if (typeof value === "string") return parseAddress(value.slice(0, 500));
  if (!value || typeof value !== "object") return { ...emptyAddress };
  const input = value as Record<string, unknown>;
  const address: Address = {
    street: text(input.street, 200),
    suburb: text(input.suburb, 100),
    state: shortState(text(input.state, 60)),
    postcode: text(input.postcode, 12),
    country: text(input.country, 60),
    placeId: text(input.placeId, 300) || null,
    latitude: coordinate(input.latitude, 90),
    longitude: coordinate(input.longitude, 180),
  };
  if (!address.country && (address.state || address.postcode)) address.country = "Australia";
  return address;
}

/** One part of a Google address (Places API (New) addressComponents). */
export interface GooglePlacePart {
  longText?: string;
  shortText?: string;
  types?: string[];
}

/** A picked Google place as Grid's parts. `formatted` fills the street when Google has no street parts. */
export function addressFromGoogle(place: {
  id?: string;
  formattedAddress?: string;
  addressComponents?: GooglePlacePart[];
  location?: { latitude: number; longitude: number };
}): Address {
  const parts = place.addressComponents ?? [];
  const find = (type: string, form: "long" | "short" = "long") => {
    const part = parts.find((candidate) => candidate.types?.includes(type));
    return (form === "short" ? (part?.shortText ?? part?.longText) : (part?.longText ?? part?.shortText)) ?? "";
  };
  const number = [find("subpremise"), find("street_number")].filter(Boolean).join("/");
  const route = find("route", "short");
  let street = [number, route].filter(Boolean).join(" ");
  const premise = find("premise") || find("establishment");
  if (!route && premise) street = [premise, street].filter(Boolean).join(", ");
  const fromText = parseAddress(place.formattedAddress ?? "");
  if (!street) street = fromText.street;
  return {
    street,
    suburb: find("locality") || find("sublocality") || find("postal_town") || fromText.suburb,
    state: shortState(find("administrative_area_level_1", "short")) || fromText.state,
    postcode: find("postal_code") || fromText.postcode,
    country: find("country") || fromText.country,
    placeId: place.id ?? null,
    latitude: place.location?.latitude ?? null,
    longitude: place.location?.longitude ?? null,
  };
}

// ---------------------------------------------------------------------
// Database columns. Each table with an address has the same columns:
// address (the one line), street, suburb, state, postcode, country,
// placeId, latitude, longitude. Quotes put "site" in front (siteSuburb).
// ---------------------------------------------------------------------

export interface AddressColumns {
  address: string | null;
  street: string | null;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  country: string | null;
  placeId: string | null;
  latitude: number | null;
  longitude: number | null;
}

/** An address as it's saved (empty parts saved as null; an empty address is all null). */
export function addressColumns(address: Address): AddressColumns {
  const orNull = (value: string) => value.trim() || null;
  const empty = isEmptyAddress(address);
  return {
    address: empty ? null : formatAddress(address),
    street: orNull(address.street),
    suburb: orNull(address.suburb),
    state: orNull(address.state),
    postcode: orNull(address.postcode),
    country: empty ? null : orNull(address.country),
    placeId: empty ? null : address.placeId,
    latitude: empty ? null : address.latitude,
    longitude: empty ? null : address.longitude,
  };
}

/** A saved address back in parts. Rows saved before parts existed are split from their one line. */
export function addressFromColumns(row: Partial<Record<keyof AddressColumns, string | number | null | undefined>>): Address {
  const value = (key: keyof AddressColumns) => (typeof row[key] === "string" ? (row[key] as string) : "");
  const hasParts = ["street", "suburb", "state", "postcode"].some((key) => value(key as keyof AddressColumns));
  if (!hasParts) return value("address") ? parseAddress(value("address")) : { ...emptyAddress };
  return {
    street: value("street"),
    suburb: value("suburb"),
    state: value("state"),
    postcode: value("postcode"),
    country: value("country"),
    placeId: value("placeId") || null,
    latitude: typeof row.latitude === "number" ? row.latitude : null,
    longitude: typeof row.longitude === "number" ? row.longitude : null,
  };
}

type Prefixed<Prefix extends string, Shape> = { [Key in keyof Shape & string as `${Prefix}${Capitalize<Key>}`]: Shape[Key] };

/** Columns with a word in front: addressColumnsWithPrefix(address, "site") → { siteAddress, siteStreet, siteSuburb… }. */
export function addressColumnsWithPrefix<Prefix extends string>(address: Address, prefix: Prefix): Prefixed<Prefix, AddressColumns> {
  const columns = addressColumns(address);
  return Object.fromEntries(Object.entries(columns).map(([key, value]) => [`${prefix}${key.charAt(0).toUpperCase()}${key.slice(1)}`, value])) as Prefixed<Prefix, AddressColumns>;
}

/** The other way: { siteStreet, siteSuburb… } → an Address. */
export function addressFromPrefixedColumns(row: Record<string, unknown>, prefix: string): Address {
  const keys: (keyof AddressColumns)[] = ["address", "street", "suburb", "state", "postcode", "country", "placeId", "latitude", "longitude"];
  const plain = Object.fromEntries(keys.map((key) => [key, row[`${prefix}${key.charAt(0).toUpperCase()}${key.slice(1)}`]]));
  return addressFromColumns(plain as Partial<Record<keyof AddressColumns, string | number | null>>);
}

/** Prisma `select` for every address column (spread into a select). */
export const addressSelect = {
  address: true,
  street: true,
  suburb: true,
  state: true,
  postcode: true,
  country: true,
  placeId: true,
  latitude: true,
  longitude: true,
} as const;

/** An address that can be left out (undefined: not changed), cleared (null) or given. An empty address counts as cleared. */
export function toOptionalAddress(value: unknown): Address | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const address = toAddress(value);
  return isEmptyAddress(address) ? null : address;
}

/** What to save for an optional address: nothing when it's not changed, all null when cleared. */
export function addressData(address: Address | null | undefined): Partial<AddressColumns> {
  if (address === undefined) return {};
  return addressColumns(address ?? emptyAddress);
}

const PART_KEYS = ["street", "suburb", "state", "postcode", "country", "placeId", "latitude", "longitude"] as const;
type PartKey = (typeof PART_KEYS)[number];

/**
 * A row read with addressSelect, ready to send: the one line stays as
 * `address`, and the parts are gathered into `addressParts` (null when
 * there's no address).
 */
export function withAddressParts<Row extends { address: string | null } & Partial<Record<PartKey, string | number | null>>>(row: Row): Omit<Row, PartKey> & { addressParts: Address | null } {
  const rest: Record<string, unknown> = { ...row };
  for (const key of PART_KEYS) delete rest[key];
  return { ...(rest as Omit<Row, PartKey>), addressParts: row.address ? addressFromColumns(row) : null };
}

/** The address of anything sent with `address` (one line) and `addressParts`: its parts, or the line split up, or empty. */
export function addressOf(item: { address?: string | null; addressParts?: Address | null } | null | undefined): Address {
  if (item?.addressParts) return item.addressParts;
  return item?.address ? parseAddress(item.address) : { ...emptyAddress };
}
