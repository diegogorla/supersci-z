import "server-only";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { cancelPaddleSubscription, listPaddleCustomerSubscriptions } from "@/lib/paddle/api";
import { getPaddleEnvironment, getPaddlePriceId, PADDLE_PLAN_CODES } from "@/lib/paddle/config";
import { cancelRecurringBatch } from "@/lib/paddle/cancellation-batch";

// The caller must obtain userId from a fresh Supabase auth.getUser() lookup.
// Never accept it from the JSON payload, a URL parameter, or user_metadata.
export async function stopAccountRecurringBilling(userId: string, immediately: boolean) {
  const admin = createAdminSupabaseClient();
  const environment = getPaddleEnvironment();
  const { data, error } = await admin.from("subscriptions")
    .select("id,provider_customer_id,provider_subscription_id,status")
    .eq("user_id", userId).eq("provider", "paddle").eq("provider_environment", environment);
  if (error) throw new Error("subscription_lookup_failed");
  const local = data ?? [];
  if (local.some((s) => s.provider_subscription_id && !s.provider_customer_id)) {
    throw new Error("unverifiable_provider_customer");
  }
  const customers = [...new Set(local.map((s) => s.provider_customer_id).filter((id): id is string => typeof id === "string"))];
  const localIds = new Set(local.map((s) => s.provider_subscription_id).filter(Boolean));
  const prices = new Set(PADDLE_PLAN_CODES.map(getPaddlePriceId).filter((price): price is string => Boolean(price)));
  return cancelRecurringBatch({
    list: async () => {
      const pages = await Promise.all(customers.map((id) => listPaddleCustomerSubscriptions(id)));
      const scoped = pages.flat().filter((subscription) => localIds.has(subscription.id)
        || subscription.items.some((item) => prices.has(item.price.id)));
      const remoteIds = new Set(scoped.map((s) => s.id));
      // Missing local recurring subscriptions are an error, not proof of cancellation.
      if (local.some((s) => s.provider_subscription_id && !remoteIds.has(s.provider_subscription_id))) {
        throw new Error("provider_subscription_missing");
      }
      return [...new Map(scoped.map((s) => [s.id, s])).values()];
    },
    cancel: async (subscription, now) => ({
      id: subscription.id,
      ...await cancelPaddleSubscription(subscription.id, now),
    }),
    persist: async (subscription) => {
      const stored = local.find((s) => s.provider_subscription_id === subscription.id);
      if (!stored) return; // Provider-only duplicates were still canceled and verified.
      const at = new Date().toISOString();
      const { error: updateError } = await admin.from("subscriptions").update({
        status: subscription.status,
        cancel_at_period_end: subscription.status !== "canceled" && subscription.scheduled_change?.action === "cancel",
        current_period_end: subscription.current_billing_period?.ends_at ?? subscription.scheduled_change?.effective_at ?? null,
        canceled_at: subscription.status === "canceled" ? at : null,
        updated_at: at,
      }).eq("id", stored.id).eq("user_id", userId).eq("provider_environment", environment);
      if (updateError) throw new Error("subscription_sync_failed");
      const { error: requestError } = await admin.from("cancellation_requests")
        .update({ status: "completed", processed_at: at, failure_code: null })
        .eq("subscription_id", stored.id).eq("user_id", userId).in("status", ["pending", "processing"]);
      if (requestError) throw new Error("cancellation_audit_failed");
    },
  }, immediately);
}
