// Settings › Email (server admin): the email server for sign-in emails.
//   GET  current settings (never the password; just whether one is saved)
//   PUT  save. password: a new one, "" to clear, or left out to keep
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { encryptSecret, getEmailSettings, setEmailSettings } from "@grid/db";
import { getContext } from "@/lib/context";

const schema = z
  .object({
    enabled: z.boolean(),
    host: z.string().trim().max(255),
    port: z.number().int().min(1).max(65535),
    security: z.enum(["ssl", "starttls", "none"]),
    username: z.string().trim().max(255),
    password: z.string().max(500).optional(),
    fromName: z.string().trim().max(100),
    fromAddress: z.union([z.literal(""), z.string().trim().email("Check the From address")]),
  })
  .strict()
  .refine((value) => !value.enabled || (value.host && value.fromAddress), "To turn email on, fill in the server and the From address");

async function admin() {
  const ctx = await getContext();
  return ctx?.user.serverAdmin ? ctx : null;
}
const denied = () => NextResponse.json({ error: { code: "forbidden", message: "Only the server admin can change this" } }, { status: 403 });

export async function GET() {
  if (!(await admin())) return denied();
  const { passwordEnc, updatedAt: _u, ...rest } = await getEmailSettings();
  return NextResponse.json({ ...rest, hasPassword: !!passwordEnc });
}

export async function PUT(request: NextRequest) {
  const ctx = await admin();
  if (!ctx) return denied();
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "invalid_input", message: parsed.error.issues[0]?.message ?? "Check the settings" } }, { status: 400 });
  }
  const { password, ...rest } = parsed.data;
  const previous = await getEmailSettings();
  const passwordEnc = password === undefined ? previous.passwordEnc : password === "" ? null : encryptSecret(password);
  await setEmailSettings({ ...rest, passwordEnc }, ctx.userId);
  return NextResponse.json({ ...rest, hasPassword: !!passwordEnc });
}
