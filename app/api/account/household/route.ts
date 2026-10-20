import { readBoundedJson } from "@/lib/security/request-body";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedAccountContext } from "@/lib/account/server";
import { getPaddleEnvironment } from "@/lib/paddle/config";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createInviteToken, hashAccountEmail, hashInviteToken, maskAccountEmail } from "@/lib/security/account-data";
import { isSameOriginMutation, siteOrigin } from "@/lib/security/request";

const inviteSchema = z.object({ email: z.string().email().max(254) }).strict();
const revokeSchema = z.object({ id: z.string().uuid() }).strict();

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return json({ error: "forbidden" }, 403);
  const parsed = inviteSchema.safeParse(await readBoundedJson(request).catch(() => null));
  if (!parsed.success) return json({ error: "invalid_email" }, 400);
  const context = await getAuthenticatedAccountContext();
  if (!context) return json({ error: "authentication_required" }, 401);
  if (context.effective.accessTier !== "cosmos" || context.effective.ownerUserId !== context.user.id || context.effective.householdSlots < 1) {
    return json({ error: "cosmos_owner_required" }, 403);
  }

  const [memberHash, ownerHash] = await Promise.all([
    hashAccountEmail(parsed.data.email),
    hashAccountEmail(context.user.email ?? ""),
  ]);
  if (!memberHash || !ownerHash) return json({ error: "not_configured" }, 503);
  if (memberHash === ownerHash) return json({ error: "self_invite" }, 400);

  const token = createInviteToken();
  const tokenHash = await hashInviteToken(token);
  if (!tokenHash) return json({ error: "token_failed" }, 500);
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.rpc("create_cosmos_invite", {
    p_owner_user_id: context.user.id,
    p_member_email_hash: memberHash,
    p_member_email_hint: maskAccountEmail(parsed.data.email),
    p_invite_token_hash: tokenHash,
    p_provider_environment: getPaddleEnvironment(),
  });
  if (error) return json({ error: "invite_failed" }, 500);
  const result = Array.isArray(data) ? data[0] : data;
  if (result?.state !== "invited") {
    const state = typeof result?.state === "string" ? result.state : "invite_failed";
    const status = state === "cosmos_owner_required" ? 403 : state === "invalid_input" ? 400 : 409;
    return json({ error: state }, status);
  }
  return json({ ok: true, inviteUrl: `${siteOrigin()}/conta/convite?token=${token}` });
}

export async function DELETE(request: Request) {
  if (!isSameOriginMutation(request)) return json({ error: "forbidden" }, 403);
  const parsed = revokeSchema.safeParse(await readBoundedJson(request).catch(() => null));
  if (!parsed.success) return json({ error: "invalid_request" }, 400);
  const context = await getAuthenticatedAccountContext();
  if (!context) return json({ error: "authentication_required" }, 401);
  if (context.effective.ownerUserId !== context.user.id) return json({ error: "owner_required" }, 403);
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.rpc("revoke_cosmos_member", {
    p_owner_user_id: context.user.id,
    p_member_id: parsed.data.id,
    p_provider_environment: getPaddleEnvironment(),
  });
  if (error) return json({ error: "revoke_failed" }, 500);
  const result = Array.isArray(data) ? data[0] : data;
  if (result?.state !== "revoked") {
    const state = typeof result?.state === "string" ? result.state : "not_found";
    return json({ error: state }, state === "cosmos_owner_required" ? 403 : 404);
  }
  return json({ ok: true, revokedDevices: result.revoked_device_count ?? 0 });
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}
