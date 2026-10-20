import { readBoundedJson } from "@/lib/security/request-body";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isSameOriginMutation } from "@/lib/security/request";
import { isMembershipRuntimeReady } from "@/lib/supabase/server-config";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getPaddleEnvironment } from "@/lib/paddle/config";
import { isPaddleControlledTestRuntimeReady } from "@/lib/paddle/test-access";
import { stopAccountRecurringBilling } from "@/lib/paddle/account-billing";
import { closePendingAccountCheckouts } from "@/lib/paddle/server-checkout";

const requestSchema = z.object({ confirmation: z.literal("EXCLUIR") }).strict();
export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return json({ error: "forbidden" }, 403);
  if (!requestSchema.safeParse(await readBoundedJson(request).catch(() => null)).success) return json({ error: "invalid_confirmation" }, 400);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  const user = data.user;
  if (error || !user?.id || !user.email) return json({ error: "authentication_required" }, 401);
  if (!isMembershipRuntimeReady() && !isPaddleControlledTestRuntimeReady(user.email)) return json({ error: "not_configured" }, 503);
  const environment = getPaddleEnvironment();
  try {
    const admin = createAdminSupabaseClient();
    await closePendingAccountCheckouts(user.id);
    const { error: beginError } = await admin.rpc("begin_billing_safe_account_deletion", {
      p_user_id: user.id, p_provider_environment: environment,
    });
    if (beginError) return json({ error: "checkout_reconciliation_required" }, 409);
    // Preserve the existing consent opt-out and deletion audit behavior.
    const { error: preparationError } = await supabase.rpc("request_account_deletion", { p_provider_environment: environment });
    if (preparationError) return json({ error: "request_failed" }, 500);
    const billing = await stopAccountRecurringBilling(user.id, true);
    if (!billing.verified) return json({ error: "provider_cancellation_failed", state: "pending_cancellation" }, 502);
    const { count, error: remainingError } = await admin.from("subscriptions")
      .select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("provider", "paddle")
      .eq("provider_environment", environment).not("provider_subscription_id", "is", null)
      .in("status", ["trialing", "active", "past_due", "paused"]);
    if (remainingError || count !== 0) return json({ error: "provider_cancellation_failed" }, 502);
    const { error: signOutError } = await supabase.auth.signOut({ scope: "global" });
    if (signOutError) return json({ error: "session_revocation_failed" }, 502);
    const { error: deletionError } = await admin.auth.admin.deleteUser(user.id, false);
    if (deletionError) return json({ error: "deletion_failed" }, 500);
    return json({ ok: true, state: "deleted" });
  } catch (error) {
    if (error instanceof Error && ["checkout_reconciliation_required", "checkout_settlement_pending"].includes(error.message)) {
      return json({ error: error.message }, 409);
    }
    return json({ error: "provider_cancellation_failed" }, 502);
  }
}
function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}
