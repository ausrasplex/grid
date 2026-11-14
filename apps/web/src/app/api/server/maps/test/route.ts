// Settings › Maps › Test: asks Google for one address with the key being
// typed (or the saved one), so a wrong key or a missing API shows before saving.
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { decryptSecret, getMapsSettings } from "@grid/db";
import { getContext } from "@/lib/context";
import { PlacesError, suggestAddresses } from "@/lib/places";

const schema = z
  .object({ apiKey: z.string().trim().max(200).optional(), country: z.string().trim().toLowerCase().max(2).default("au") })
  .strict();

export async function POST(request: NextRequest) {
  const ctx = await getContext();
  if (!ctx?.user.serverAdmin) return NextResponse.json({ error: { code: "forbidden", message: "Only the server admin can test this" } }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: "invalid_input", message: "Check the settings" } }, { status: 400 });
  const saved = await getMapsSettings();
  const key = parsed.data.apiKey || (saved.apiKeyEnc ? decryptSecret(saved.apiKeyEnc) : "");
  if (!key) return NextResponse.json({ ok: false, message: "Add the API key first" });
  try {
    const suggestions = await suggestAddresses("1 Martin Place Sydney", crypto.randomUUID(), { key, country: parsed.data.country });
    return suggestions.length
      ? NextResponse.json({ ok: true, message: `Working: Google suggested "${suggestions[0]!.text}".` })
      : NextResponse.json({ ok: false, message: "The key works, but Google suggested nothing. Check the country." });
  } catch (error) {
    const message = error instanceof PlacesError ? error.message : "Couldn't reach Google";
    return NextResponse.json({ ok: false, message: `Google said: ${message}` });
  }
}
