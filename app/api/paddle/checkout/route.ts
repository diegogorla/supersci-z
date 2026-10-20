import { getOwnerPreview } from "@/lib/owner-preview/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { prepareServerCheckout } from "@/lib/paddle/server-checkout";
import { CheckoutPreparationError } from "@/lib/paddle/checkout-preparation";
import { readBoundedJson } from "@/lib/security/request-body";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isSameOriginMutation } from "@/lib/security/request";
import { isMembershipRuntimeReady } from "@/lib/supabase/server-config";
import { isPaddleControlledTestRuntimeReady } from "@/lib/paddle/test-access";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getPaddleCheckoutConfig, PADDLE_PLAN_CODES } from "@/lib/paddle/config";

const requestSchema = z.object({ plan: z.enum(PADDLE_PLAN_CODES) }).strict();

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return json({ error: "forbidden" }, 403);
  if (await getOwnerPreview()) return json({ error: "owner_preview_active" }, 409);
  const parsed = requestSchema.safeParse(await readBoundedJson(request).catch(() => null));
  if (!parsed.success) return json({ error: "invalid_plan" }, 400);

  const supabase = await createServerSupabaseClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData.user;
  if (userError || !user?.id || !user.email) return json({ error: "authentication_required" }, 401);
  if (!isMembershipRuntimeReady() && !isPaddleControlledTestRuntimeReady(user.email)) {
    return json({ error: "not_configured" }, 503);
  }

  let checkout;
  try {
    checkout = getPaddleCheckoutConfig(parsed.data.plan);
  } catch {
    return json({ error: "checkout_not_configured" }, 503);
  }

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.rpc("create_checkout_intent_for_user", {
    p_user_id: user.id,
    p_plan_code: parsed.data.plan === "founder_annual_pix" ? "founder_annual" : parsed.data.plan,
    p_price_id: checkout.priceId,
    p_provider_environment: checkout.environment,
  });
  const intent = Array.isArray(data) ? data[0] : data;
  if (error || !intent?.intent_id) {
    const known = ["already_subscribed", "checkout_in_progress", "account_deletion_pending"].find((code) => error?.message.includes(code));
    return json({ error: known ?? "intent_failed" }, known ? 409 : 500);
  }

  const { data: previousSubscription } = await supabase.from("subscriptions")
    .select("provider_customer_id")
    .eq("user_id", user.id)
    .eq("provider", "paddle")
    .eq("provider_environment", checkout.environment)
    .not("provider_customer_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const paddleCustomerId = typeof previousSubscription?.provider_customer_id === "string"
    && /^ctm_[a-z0-9]{26}$/.test(previousSubscription.provider_customer_id)
    ? previousSubscription.provider_customer_id
    : null;

  let transactionId: string;
  try { transactionId = await prepareServerCheckout(user.id, intent.intent_id, checkout.priceId, paddleCustomerId); }
  catch (error) { return json({ error: error instanceof CheckoutPreparationError ? error.message : "checkout_reconciliation_required" }, 409); }

  return json({
    transactionId,
    clientToken: checkout.clientToken,
    environment: checkout.environment,
    priceId: checkout.priceId,
    checkoutReference: intent.intent_id,
    customerEmail: user.email,
    paddleCustomerId,
    successUrl: "https://supersci-z.com/assine/sucesso",
    // Let Paddle select the payment methods actually enabled for the buyer's
    // location and device. The Pix-only price intentionally remains restricted.
    allowedPaymentMethods: parsed.data.plan === "founder_annual_pix" ? ["pix"] : null,
  });
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}
