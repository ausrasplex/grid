// The full address of a picked suggestion (AddressField).
import { NextResponse, type NextRequest } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { PlacesError, addressDetails } from "@/lib/places";

export async function GET(request: NextRequest) {
  if (!(await getSessionUserId())) return NextResponse.json({ error: { code: "unauthorized", message: "Sign in required" } }, { status: 401 });
  const id = (request.nextUrl.searchParams.get("id") ?? "").slice(0, 300);
  const session = (request.nextUrl.searchParams.get("session") ?? "").slice(0, 100);
  if (!id) return NextResponse.json({ error: { code: "invalid_input", message: "No place" } }, { status: 400 });
  try {
    return NextResponse.json(await addressDetails(id, session));
  } catch (error) {
    console.error("[places] details failed", error instanceof PlacesError ? error.message : error);
    return NextResponse.json(null);
  }
}
