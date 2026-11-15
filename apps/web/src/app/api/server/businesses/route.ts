// Settings › Accounts & devices (server admin): every business on the server.
//   GET                                         the list, deleted ones included
//   POST { companyId, action: "delete" }        delete it (restorable until Recently deleted runs out)
//   POST { companyId, action: "restore" }       bring a deleted one back
// docs/roadmap.md "Deleting a business".
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isHttpError } from "@grid/core";
import { adminDeleteCompany, adminRestoreCompany, listAllCompanies } from "@grid/block-companies";
import { getContext } from "@/lib/context";
import "@/blocks"; // sets up the app, so the audit entry gets the IP and device

const forbidden = () => NextResponse.json({ error: { code: "forbidden", message: "Only the server admin can do this" } }, { status: 403 });

export async function GET() {
  const ctx = await getContext();
  if (!ctx?.user.serverAdmin) return forbidden();
  return NextResponse.json(await listAllCompanies());
}

const schema = z.object({ companyId: z.string().uuid(), action: z.enum(["delete", "restore"]) }).strict();

export async function POST(request: NextRequest) {
  const ctx = await getContext();
  if (!ctx?.user.serverAdmin) return forbidden();
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: "invalid_input", message: "Pick a business" } }, { status: 400 });
  try {
    const { companyId, action } = parsed.data;
    return NextResponse.json(action === "delete" ? await adminDeleteCompany(ctx.userId, companyId) : await adminRestoreCompany(ctx.userId, companyId));
  } catch (error) {
    if (isHttpError(error)) return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    throw error;
  }
}
