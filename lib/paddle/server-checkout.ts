import "server-only";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createPaddleCheckoutTransaction, readPaddleCheckoutTransaction, cancelPaddleCheckoutTransaction } from "@/lib/paddle/api";
import { prepareCheckoutTransaction } from "@/lib/paddle/checkout-preparation";
import { getPaddleEnvironment } from "@/lib/paddle/config";

export async function prepareServerCheckout(userId: string, intentId: string, priceId: string, customerId: string | null) {
  const admin = createAdminSupabaseClient();
  return prepareCheckoutTransaction({
    claim: async () => {
      const { data, error } = await admin.rpc("claim_paddle_checkout_transaction", { p_user_id: userId, p_intent_id: intentId });
      const row = Array.isArray(data) ? data[0] : data;
      if (error || !row?.state) throw new Error("checkout_claim_failed");
      return row;
    },
    create: async () => createPaddleCheckoutTransaction(priceId, intentId, customerId),
    finish: async (claimId, transactionId) => {
      const { data, error } = await admin.rpc("finish_paddle_checkout_transaction", {
        p_user_id: userId, p_intent_id: intentId, p_claim_id: claimId, p_transaction_id: transactionId,
      });
      if (error || data !== true) throw new Error("checkout_persistence_failed");
    },
    uncertain: async (claimId) => {
      const { error } = await admin.rpc("mark_paddle_checkout_uncertain", { p_user_id: userId, p_intent_id: intentId, p_claim_id: claimId });
      if (error) throw new Error("checkout_reconciliation_required");
    },
  });
}

// Called before account deletion. A ready unpaid transaction is explicitly
// canceled at Paddle before its local intent is closed. Paid/uncertain outcomes
// block deletion until the signed webhook or an operator reconciles them.
export async function closePendingAccountCheckouts(userId: string) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.rpc("list_pending_paddle_checkouts", {
    p_user_id: userId, p_provider_environment: getPaddleEnvironment(),
  });
  if (error) throw new Error("checkout_lookup_failed");
  for (const pending of data ?? []) {
    if (pending.state !== "ready" || !pending.transaction_id) throw new Error("checkout_reconciliation_required");
    const transaction = await readPaddleCheckoutTransaction(pending.transaction_id);
    if (transaction.custom_data?.checkout_reference !== pending.intent_id) throw new Error("checkout_reference_mismatch");
    if (!["draft", "ready", "canceled"].includes(transaction.status)) throw new Error("checkout_settlement_pending");
    if (transaction.status !== "canceled") await cancelPaddleCheckoutTransaction(transaction.id);
    const { data: closed, error: closeError } = await admin.rpc("close_paddle_checkout_transaction", {
      p_user_id: userId, p_intent_id: pending.intent_id, p_transaction_id: transaction.id,
    });
    if (closeError || closed !== true) throw new Error("checkout_close_failed");
  }
}
