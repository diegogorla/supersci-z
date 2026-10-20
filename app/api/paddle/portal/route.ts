import { NextResponse } from "next/server";
import { isSameOriginMutation } from "@/lib/security/request";
import { isMembershipRuntimeReady } from "@/lib/supabase/server-config";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createPaddlePortalSession } from "@/lib/paddle/api";
import { getPaddleEnvironment } from "@/lib/paddle/config";
import { isPaddleControlledTestRuntimeReady } from "@/lib/paddle/test-access";

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return json({ error: "forbidden" }, 403);
  const supabase = await createServerSupabaseClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData.user;
  if (userError || !user?.id || !user.email) return json({ error: "authentication_required" }, 401);
  if (!isMembershipRuntimeReady() && !isPaddleControlledTestRuntimeReady(user.email)) {
    return json({ error: "not_configured" }, 503);
  }

  const admin = createAdminSupabaseClient();
  const { data: subscription, error } = await admin.from("subscriptions")
    .select("provider_customer_id,provider_subscription_id")
    .eq("user_id", user.id).eq("provider", "paddle")
    .eq("provider_environment", getPaddleEnvironment())
    .in("status", ["trialing", "active", "past_due", "paused"])
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error || !subscription?.provider_customer_id) return json({ error: "subscription_not_found" }, 404);

  try {
    const url = await createPaddlePortalSession(subscription.provider_customer_id, subscription.provider_subscription_id);
    return json({ url });
  } catch {
    return json({ error: "portal_unavailable" }, 502);
  }
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}
