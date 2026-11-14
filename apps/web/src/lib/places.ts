// Address suggestions from Google (Places API (New)), asked by the server so
// the API key never reaches a browser. Settings › Maps turns it on.
//
// Billing: suggestions use a session token; picking one ends the session with
// a Place Details call for the full address, so typing an address and picking
// it counts as one session, not one charge per letter.
import "server-only";
import { decryptSecret, getMapsSettings, type MapsSettings } from "@grid/db";

export interface AddressSuggestion {
  placeId: string;
  /** "12 Smith St, Brunswick VIC 3056" */
  text: string;
  /** "12 Smith St" */
  main: string;
  /** "Brunswick VIC 3056" */
  secondary: string;
}

const PLACES = "https://places.googleapis.com/v1";

export class PlacesError extends Error {
  name = "PlacesError";
}

/** The key when address suggestions are on, else null. */
export async function placesKey(settings?: MapsSettings): Promise<{ key: string; country: string } | null> {
  const maps = settings ?? (await getMapsSettings());
  if (!maps.enabled || !maps.apiKeyEnc) return null;
  return { key: decryptSecret(maps.apiKeyEnc), country: maps.country };
}

/** "…, Australia" adds nothing on an Australian server. */
const tidy = (text: string, country: string) => (country === "au" ? text.replace(/,\s*Australia$/, "") : text);

async function google<T>(key: string, url: string, init: { method: string; body?: string; fieldMask: string }): Promise<T> {
  const response = await fetch(url, {
    method: init.method,
    body: init.body,
    headers: { "content-type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": init.fieldMask },
    signal: AbortSignal.timeout(5000),
  });
  const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  if (!response.ok) throw new PlacesError(body?.error?.message ?? `Google said ${response.status}`);
  return body as T;
}

interface Prediction {
  placeId: string;
  text?: { text: string };
  structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } };
}

export async function suggestAddresses(input: string, sessionToken: string, override?: { key: string; country: string }): Promise<AddressSuggestion[]> {
  const places = override ?? (await placesKey());
  if (!places) return [];
  const body = {
    input,
    sessionToken,
    languageCode: "en-AU",
    ...(places.country ? { includedRegionCodes: [places.country] } : {}),
  };
  const result = await google<{ suggestions?: { placePrediction?: Prediction }[] }>(places.key, `${PLACES}/places:autocomplete`, {
    method: "POST",
    body: JSON.stringify(body),
    fieldMask: "suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat",
  });
  return (result.suggestions ?? [])
    .map((suggestion) => suggestion.placePrediction)
    .filter((prediction): prediction is Prediction => !!prediction?.placeId)
    .slice(0, 6)
    .map((prediction) => ({
      placeId: prediction.placeId,
      text: tidy(prediction.text?.text ?? "", places.country),
      main: prediction.structuredFormat?.mainText?.text ?? prediction.text?.text ?? "",
      secondary: tidy(prediction.structuredFormat?.secondaryText?.text ?? "", places.country),
    }));
}

/** The full address of a picked suggestion (ends the billing session), and where it is. */
export async function addressDetails(placeId: string, sessionToken: string): Promise<{ address: string; location: { lat: number; lng: number } | null } | null> {
  const places = await placesKey();
  if (!places) return null;
  const result = await google<{ formattedAddress?: string; location?: { latitude: number; longitude: number } }>(
    places.key,
    `${PLACES}/places/${encodeURIComponent(placeId)}?sessionToken=${encodeURIComponent(sessionToken)}&languageCode=en-AU`,
    { method: "GET", fieldMask: "formattedAddress,location" },
  );
  if (!result.formattedAddress) return null;
  return {
    address: tidy(result.formattedAddress, places.country),
    location: result.location ? { lat: result.location.latitude, lng: result.location.longitude } : null,
  };
}
