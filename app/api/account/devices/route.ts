import { readBoundedJson } from "@/lib/security/request-body";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedAccountContext } from "@/lib/account/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isSameOriginMutation } from "@/lib/security/request";

const schema = z.object({ id: z.string().uuid() }).strict();

export async function DELETE(request: Request) {
  if (!isSameOriginMutation(request)) return json({ error: "forbidden" }, 403);
  const parsed = schema.safeParse(await readBoundedJson(request).catch(() => null));
  if (!parsed.success) return json({ error: "invalid_request" }, 400);
  const context = await getAuthenticatedAccountContext();
  if (!context) return json({ error: "authentication_required" }, 401);
  const admin = createAdminSupabaseClient();
  const { data: device } = await admin.from("access_devices").select("id,user_id").eq("id", parsed.data.id).maybeSingle();
  if (!device) return json({ error: "not_found" }, 404);

  let authorized = device.user_id === context.user.id;
  if (!authorized && context.effective.ownerUserId === context.user.id) {
    const { data: member } = await admin.from("household_members")
      .select("id")
      .eq("owner_user_id", context.user.id)
      .eq("accepted_user_id", device.user_id)
      .eq("status", "active")
      .maybeSingle();
    authorized = Boolean(member);
  }
  if (!authorized) return json({ error: "forbidden" }, 403);
  const { error } = await admin.from("access_devices")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", device.id);
  return error ? json({ error: "revoke_failed" }, 500) : json({ ok: true });
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}
