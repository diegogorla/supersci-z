import { NextResponse } from "next/server";
import { isSameOriginMutation } from "@/lib/security/request";
import { isMembershipRuntimeReady } from "@/lib/supabase/server-config";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getPaddleEnvironment } from "@/lib/paddle/config";
import { isPaddleControlledTestRuntimeReady } from "@/lib/paddle/test-access";
import { stopAccountRecurringBilling } from "@/lib/paddle/account-billing";

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return json({ error: "forbidden" }, 403);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  const user = data.user;
  if (error || !user?.id || !user.email) return json({ error: "authentication_required" }, 401);
  if (!isMembershipRuntimeReady() && !isPaddleControlledTestRuntimeReady(user.email)) return json({ error: "not_configured" }, 503);
  const { error: requestError } = await supabase.rpc("request_subscription_cancellation", {
    p_provider_environment: getPaddleEnvironment(),
  });
  if (requestError) return json({ error: "request_failed" }, 500);
  try {
    const result = await stopAccountRecurringBilling(user.id, false);
    if (!result.verified) return json({ error: "provider_unavailable", state: "partially_canceled" }, 502);
    return json({ ok: true, state: result.completed === 0 ? "no_active_subscription" : "scheduled" });
  } catch {
    return json({ error: "provider_unavailable" }, 502);
  }
}
function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}
