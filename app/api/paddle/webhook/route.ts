import { readBoundedText, RequestBodyError } from "@/lib/security/request-body";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getPaddleEnvironment, getPaddleWebhookSecret } from "@/lib/paddle/config";
import { sha256Hex, verifyPaddleSignature } from "@/lib/paddle/webhook";
import { getPublicSupabaseConfig } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

const paddleId = z.string().regex(/^[a-z]+_[a-z0-9]{26}$/).nullable().optional();
const eventSchema = z.object({
  event_id: z.string().regex(/^evt_[a-z0-9]{26}$/),
  event_type: z.string().min(3).max(80),
  occurred_at: z.string().datetime(),
  data: z.object({
    id: z.string(),
    status: z.string().optional(),
    customer_id: paddleId,
    subscription_id: paddleId,
    transaction_id: paddleId,
    custom_data: z.record(z.unknown()).nullable().optional(),
    next_billed_at: z.string().datetime().nullable().optional(),
    current_billing_period: z.object({ ends_at: z.string().datetime() }).nullable().optional(),
    scheduled_change: z.object({ action: z.string(), effective_at: z.string().datetime().optional() }).nullable().optional(),
    items: z.array(z.object({
      price: z.object({ id: z.string() }),
      trial_dates: z.object({ ends_at: z.string().datetime() }).nullable().optional(),
    })).optional(),
  }).passthrough(),
}).passthrough();

const adjustmentSchema = z.object({
  event_id: z.string().regex(/^evt_[a-z0-9]{26}$/),
  event_type: z.enum(["adjustment.created", "adjustment.updated"]),
  occurred_at: z.string().datetime(),
  data: z.object({
    id: z.string().regex(/^adj_[a-z0-9]{26}$/),
    action: z.enum(["refund", "chargeback", "chargeback_warning", "chargeback_reverse", "chargeback_warning_reverse", "credit", "credit_reverse"]),
    status: z.enum(["pending_approval", "approved", "rejected", "reversed"]),
    type: z.enum(["full", "partial", "tax"]).nullable(),
    transaction_id: z.string().regex(/^txn_[a-z0-9]{26}$/),
    subscription_id: z.string().regex(/^sub_[a-z0-9]{26}$/).nullable().optional(),
  }).passthrough(),
}).passthrough();

const allowedStatuses = new Set(["trialing", "active", "past_due", "paused", "canceled"]);

export async function POST(request: Request) {
  const signature = request.headers.get("paddle-signature") ?? "";
  let rawBody: string;
  try { rawBody = await readBoundedText(request, 1_048_576); }
  catch (error) { return json({ error: "invalid_body" }, error instanceof RequestBodyError ? error.status : 400); }
  let secret: string;
  try {
    secret = getPaddleWebhookSecret();
  } catch {
    return json({ error: "not_configured" }, 503);
  }
  if (!(await verifyPaddleSignature(rawBody, signature, secret))) return json({ error: "invalid_signature" }, 401);

  const parsedJson = await safeJson(rawBody);
  const adjustmentType = z.object({ event_type: z.enum(["adjustment.created", "adjustment.updated"]) }).safeParse(parsedJson);
  if (adjustmentType.success) {
    const adjustment = adjustmentSchema.safeParse(parsedJson);
    if (!adjustment.success) return json({ error: "invalid_adjustment" }, 400);
    const event = adjustment.data;
    const { url, publishableKey } = getPublicSupabaseConfig();
    const db = createClient(url, publishableKey, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
    const { data: outcome, error } = await db.rpc("process_paddle_adjustment_from_webhook", {
      p_provider_environment: getPaddleEnvironment(), p_webhook_secret: secret,
      p_event_id: event.event_id, p_event_type: event.event_type, p_occurred_at: event.occurred_at,
      p_payload_sha256: await sha256Hex(rawBody), p_adjustment_id: event.data.id,
      p_action: event.data.action, p_status: event.data.status, p_adjustment_type: event.data.type,
      p_provider_transaction_id: event.data.transaction_id, p_provider_subscription_id: event.data.subscription_id ?? null,
    });
    if (error) return json({ error: "processing_failed" }, 500);
    return json({ ok: true, state: (Array.isArray(outcome) ? outcome[0] : outcome)?.state ?? "recorded" });
  }

  const parsed = eventSchema.safeParse(parsedJson);
  if (!parsed.success) return json({ error: "invalid_payload" }, 400);

  const event = parsed.data;
  const data = event.data;
  const checkoutReference = typeof data.custom_data?.checkout_reference === "string" ? data.custom_data.checkout_reference : null;
  const priceIds = [...new Set((data.items ?? []).map((item) => item.price.id))];
  const providerSubscriptionId = event.event_type.startsWith("subscription.") ? data.id : data.subscription_id ?? null;
  const providerTransactionId = event.event_type.startsWith("transaction.") ? data.id : data.transaction_id ?? null;
  const status = data.status && allowedStatuses.has(data.status) ? data.status : null;

  const { url, publishableKey } = getPublicSupabaseConfig();
  const webhookDb = createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data: result, error } = await webhookDb.rpc("process_paddle_event_from_webhook", {
    p_provider_environment: getPaddleEnvironment(),
    p_webhook_secret: secret,
    p_event_id: event.event_id,
    p_event_type: event.event_type,
    p_occurred_at: event.occurred_at,
    p_payload_sha256: await sha256Hex(rawBody),
    p_checkout_reference: checkoutReference,
    p_price_id: priceIds.length === 1 ? priceIds[0] : null,
    p_provider_customer_id: data.customer_id ?? null,
    p_provider_subscription_id: providerSubscriptionId,
    p_provider_transaction_id: providerTransactionId,
    p_subscription_status: status,
    p_trial_ends_at: data.items?.[0]?.trial_dates?.ends_at ?? null,
    p_current_period_end: data.current_billing_period?.ends_at ?? data.next_billed_at ?? null,
    p_cancel_at_period_end: data.scheduled_change?.action === "cancel",
  });
  if (error) return json({ error: "processing_failed" }, 500);
  const outcome = Array.isArray(result) ? result[0] : result;
  return json({ ok: true, state: outcome?.state ?? "accepted" });
}

async function safeJson(value: string) {
  try { return JSON.parse(value) as unknown; } catch { return null; }
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}
