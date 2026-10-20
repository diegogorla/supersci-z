import { NextResponse } from "next/server";
import { getAuthenticatedAccountContext } from "@/lib/account/server";
import { verifyEditorialMailbox } from "@/lib/editorial/hostinger-editorial-alert";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };

/** Suggested location: app/api/gestao/editorial/email/verificar/route.ts. */
export async function GET() {
  const context = await getAuthenticatedAccountContext();
  if (!context) return NextResponse.json({ error: "authentication_required" }, { status: 401, headers });
  if (context.authority !== "admin") return NextResponse.json({ error: "administrator_required" }, { status: 403, headers });
  try {
    const mailbox = await verifyEditorialMailbox();
    return NextResponse.json({ ok: true, sender: mailbox.address, sendsEmail: false }, { headers });
  } catch {
    return NextResponse.json({ error: "editorial_mail_verification_failed" }, { status: 503, headers });
  }
}
