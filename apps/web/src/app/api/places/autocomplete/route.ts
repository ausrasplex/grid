// Address suggestions while typing (AddressField). Signed-in people only;
// { enabled: false } when the server admin hasn't turned them on.
import { NextResponse, type NextRequest } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { PlacesError, placesKey, suggestAddresses } from "@/lib/places";

export async function GET(request: NextRequest) {
  if (!(await getSessionUserId())) return NextResponse.json({ error: { code: "unauthorized", message: "Sign in required" } }, { status: 401 });
  const places = await placesKey();
  if (!places) return NextResponse.json({ enabled: false, suggestions: [] });
  const input = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 200);
  const session = (request.nextUrl.searchParams.get("session") ?? "").slice(0, 100);
  if (input.length < 3 || !session) return NextResponse.json({ enabled: true, suggestions: [] });
  try {
    const suggestions = await suggestAddresses(input, session, places);
    return NextResponse.json({ enabled: true, suggestions }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    // Never stop anyone typing an address: no suggestions, and a note in the log.
    console.error("[places] suggestions failed", error instanceof PlacesError ? error.message : error);
    return NextResponse.json({ enabled: true, suggestions: [], failed: true });
  }
}
