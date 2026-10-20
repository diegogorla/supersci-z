import { readBoundedJson } from "@/lib/security/request-body";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedAccountContext } from "@/lib/account/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getPaddleEnvironment } from "@/lib/paddle/config";
import { hashAccountEmail, hashInviteToken } from "@/lib/security/account-data";
import { isSameOriginMutation } from "@/lib/security/request";

const schema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict();

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return json({ error: "forbidden" }, 403);
  const parsed = schema.safeParse(await readBoundedJson(request).catch(() => null));
  if (!parsed.success) return json({ error: "invalid_invite" }, 400);
  const context = await getAuthenticatedAccountContext();
  if (!context || !context.user.email) return json({ error: "authentication_required" }, 401);
  if (!context.user.email_confirmed_at) return json({ error: "verified_email_required" }, 403);
  const [emailHash, tokenHash] = await Promise.all([
    hashAccountEmail(context.user.email),
    hashInviteToken(parsed.data.token),
  ]);
  if (!emailHash || !tokenHash) return json({ error: "not_configured" }, 503);

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.rpc("accept_cosmos_invite", {
    p_invite_token_hash: tokenHash,
    p_member_email_hash: emailHash,
    p_accepted_user_id: context.user.id,
    p_provider_environment: getPaddleEnvironment(),
  });
  if (error) return json({ error: "accept_failed" }, 500);
  const result = Array.isArray(data) ? data[0] : data;
  if (result?.state !== "accepted") {
    const state = typeof result?.state === "string" ? result.state : "invite_not_found";
    const status = state === "invite_not_found" ? 404 : 409;
    return json({ error: state }, status);
  }
  return json({ ok: true, revokedDevices: result.revoked_device_count ?? 0 });
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}
