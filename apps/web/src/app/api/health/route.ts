// Health check for Docker / Unraid: is the app up and can it reach the database?
// No sign-in needed, and it says nothing about the data.
import { NextResponse } from "next/server";
import { db } from "@grid/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "database unreachable" }, { status: 503 });
  }
}
