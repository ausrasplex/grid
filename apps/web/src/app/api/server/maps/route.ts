// Settings › Maps (server admin): address suggestions from Google.
//   GET  current settings (never the key; just whether one is saved)
//   PUT  save. apiKey: a new one, "" to clear, or left out to keep
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { encryptSecret, getMapsSettings, setMapsSettings } from "@grid/db";
import { getContext } from "@/lib/context";

const schema = z
  .object({
    enabled: z.boolean(),
    apiKey: z.string().trim().max(200).optional(),
    country: z.union([z.literal(""), z.string().trim().toLowerCase().regex(/^[a-z]{2}$/, "Use a two-letter country code, e.g. au")]),
  })
  .strict();

async function admin() {
  const ctx = await getContext();
  return ctx?.user.serverAdmin ? ctx : null;
}
const denied = () => NextResponse.json({ error: { code: "forbidden", message: "Only the server admin can change this" } }, { status: 403 });

export async function GET() {
  if (!(await admin())) return denied();
  const { apiKeyEnc, updatedAt: _u, ...rest } = await getMapsSettings();
  return NextResponse.json({ ...rest, hasKey: !!apiKeyEnc });
}

export async function PUT(request: NextRequest) {
  const ctx = await admin();
  if (!ctx) return denied();
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "invalid_input", message: parsed.error.issues[0]?.message ?? "Check the settings" } }, { status: 400 });
  }
  const { apiKey, ...rest } = parsed.data;
  const previous = await getMapsSettings();
  const apiKeyEnc = apiKey === undefined ? previous.apiKeyEnc : apiKey === "" ? null : encryptSecret(apiKey);
  if (rest.enabled && !apiKeyEnc) {
    return NextResponse.json({ error: { code: "invalid_input", message: "Add the API key to turn address suggestions on" } }, { status: 400 });
  }
  await setMapsSettings({ ...rest, apiKeyEnc }, ctx.userId);
  return NextResponse.json({ ...rest, hasKey: !!apiKeyEnc });
}
