// Settings › Email › Send a test email. Uses the settings being edited (not
// yet saved), so a mistake shows before it's saved. The server's answer is
// passed back so "wrong password" or "can't connect" is clear.
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { encryptSecret, getEmailSettings, type EmailSettings } from "@grid/db";
import { getContext } from "@/lib/context";
import { fromHeader, transportFor } from "@/lib/mail";

const schema = z
  .object({
    host: z.string().trim().min(1, "Fill in the server"),
    port: z.number().int().min(1).max(65535),
    security: z.enum(["ssl", "starttls", "none"]),
    username: z.string().trim().max(255),
    password: z.string().max(500).optional(),
    fromName: z.string().trim().max(100),
    fromAddress: z.string().trim().email("Check the From address"),
    to: z.string().trim().email("Check the address to send the test to"),
  })
  .strict();

export async function POST(request: NextRequest) {
  const ctx = await getContext();
  if (!ctx?.user.serverAdmin) return NextResponse.json({ error: { code: "forbidden", message: "Only the server admin can do this" } }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: "invalid_input", message: parsed.error.issues[0]?.message } }, { status: 400 });
  const { to, password, ...rest } = parsed.data;
  const previous = await getEmailSettings();
  const settings: EmailSettings = { ...rest, enabled: true, passwordEnc: password ? encryptSecret(password) : previous.passwordEnc };
  try {
    const transport = transportFor(settings);
    await transport.verify();
    await transport.sendMail({
      from: fromHeader(settings),
      to,
      subject: "Grid test email",
      text: "This is a test from your Grid server. If you can read it, sign-in links and password resets will arrive too.",
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, message: (error as Error).message.slice(0, 300) });
  }
}
