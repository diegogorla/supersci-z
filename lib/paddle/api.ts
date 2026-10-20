import "server-only";
import { getPaddleServerConfig } from "./config";
import { logPaddleHttpFailure } from "./http-diagnostics";

type PaddleResponse<T> = { data: T; meta?: { request_id?: string } };

async function paddleRequest<T>(path: string, init: RequestInit = {}) {
  const { apiBaseUrl, apiKey } = getPaddleServerConfig();
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!response.ok) {
    await logPaddleHttpFailure(response);
    throw new Error(`Paddle request failed with status ${response.status}.`);
  }
  return response.json() as Promise<PaddleResponse<T>>;
}

export async function cancelPaddleSubscription(subscriptionId: string, immediately = false) {
  if (!/^sub_[a-z0-9]{26}$/.test(subscriptionId)) throw new Error("Invalid Paddle subscription ID.");
  const result = await paddleRequest<{
    status: string;
    scheduled_change: { action?: string; effective_at?: string } | null;
    current_billing_period: { ends_at?: string } | null;
  }>(`/subscriptions/${subscriptionId}/cancel`, {
    method: "POST",
    body: JSON.stringify({ effective_from: immediately ? "immediately" : "next_billing_period" }),
  });
  return result.data;
}

export async function createPaddlePortalSession(customerId: string, subscriptionId?: string | null) {
  if (!/^ctm_[a-z0-9]{26}$/.test(customerId)) throw new Error("Invalid Paddle customer ID.");
  if (subscriptionId && !/^sub_[a-z0-9]{26}$/.test(subscriptionId)) throw new Error("Invalid Paddle subscription ID.");
  const result = await paddleRequest<{
    urls: {
      general: { overview: string };
      subscriptions?: Array<{ id: string; cancel_subscription: string; update_subscription_payment_method: string }>;
    };
  }>(`/customers/${customerId}/portal-sessions`, {
    method: "POST",
    body: JSON.stringify(subscriptionId ? { subscription_ids: [subscriptionId] } : {}),
  });
  return result.data.urls.general.overview;
}


// Append to lib/paddle/api.ts, where paddleRequest and getPaddleServerConfig exist.
export type PaddleSubscriptionSnapshot = {
  id: string;
  customer_id: string;
  status: string;
  scheduled_change: { action?: string; effective_at?: string } | null;
  current_billing_period: { ends_at?: string } | null;
  items: Array<{ price: { id: string } }>;
};

export async function listPaddleCustomerSubscriptions(customerId: string) {
  if (!/^ctm_[a-z0-9]{26}$/.test(customerId)) throw new Error("Invalid Paddle customer ID.");
  const { apiBaseUrl } = getPaddleServerConfig();
  const subscriptions: PaddleSubscriptionSnapshot[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 100; page += 1) {
    const query = new URLSearchParams({ customer_id: customerId, per_page: "200" });
    if (cursor) query.set("after", cursor);
    const result = await paddleRequest<PaddleSubscriptionSnapshot[]>(`/subscriptions?${query}`) as {
      data: PaddleSubscriptionSnapshot[];
      meta?: { pagination?: { has_more?: boolean; next?: string | null } };
    };
    if (!Array.isArray(result.data) || result.data.some((s) => s.customer_id !== customerId
      || !/^sub_[a-z0-9]{26}$/.test(s.id) || !Array.isArray(s.items))) throw new Error("Unexpected Paddle subscription response.");
    subscriptions.push(...result.data);
    if (!result.meta?.pagination?.has_more) return subscriptions;
    const next = new URL(result.meta.pagination.next ?? "", apiBaseUrl);
    const nextCursor = next.searchParams.get("after");
    if (next.origin !== apiBaseUrl || next.pathname !== "/subscriptions" || !nextCursor
      || !/^sub_[a-z0-9]{26}$/.test(nextCursor) || nextCursor === cursor) throw new Error("Invalid Paddle pagination.");
    cursor = nextCursor;
  }
  throw new Error("Paddle pagination limit exceeded.");
}

type PaddleCheckoutTransaction = {
  id: string;
  status: string;
  customer_id: string | null;
  custom_data: { checkout_reference?: string } | null;
  items: Array<{ price: { id: string }; quantity: number }>;
};

export async function createPaddleCheckoutTransaction(priceId: string, intentId: string, customerId: string | null) {
  if (!/^pri_[a-z0-9]{26}$/.test(priceId) || !/^[a-f0-9-]{36}$/i.test(intentId)
    || (customerId !== null && !/^ctm_[a-z0-9]{26}$/.test(customerId))) throw new Error("Invalid checkout configuration.");
  const result = await paddleRequest<PaddleCheckoutTransaction>("/transactions", {
    method: "POST",
    signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({
      items: [{ price_id: priceId, quantity: 1 }],
      collection_mode: "automatic",
      custom_data: { checkout_reference: intentId },
      checkout: { url: "https://supersci-z.com/assine" },
      ...(customerId ? { customer_id: customerId } : {}),
    }),
  });
  const transaction = result.data;
  if (!/^txn_[a-z0-9]{26}$/.test(transaction.id) || transaction.custom_data?.checkout_reference !== intentId
    || transaction.items.length !== 1 || transaction.items[0]?.price.id !== priceId || transaction.items[0]?.quantity !== 1
    || (customerId && transaction.customer_id !== customerId)) throw new Error("Unexpected Paddle checkout response.");
  return transaction.id;
}

export async function readPaddleCheckoutTransaction(transactionId: string) {
  if (!/^txn_[a-z0-9]{26}$/.test(transactionId)) throw new Error("Invalid Paddle transaction ID.");
  const result = await paddleRequest<PaddleCheckoutTransaction>(`/transactions/${transactionId}`, { signal: AbortSignal.timeout(15_000) });
  if (result.data.id !== transactionId) throw new Error("Unexpected Paddle transaction.");
  return result.data;
}

export async function cancelPaddleCheckoutTransaction(transactionId: string) {
  if (!/^txn_[a-z0-9]{26}$/.test(transactionId)) throw new Error("Invalid Paddle transaction ID.");
  const result = await paddleRequest<PaddleCheckoutTransaction>(`/transactions/${transactionId}`, {
    method: "PATCH", signal: AbortSignal.timeout(15_000), body: JSON.stringify({ status: "canceled" }),
  });
  if (result.data.id !== transactionId || result.data.status !== "canceled") throw new Error("Checkout cancellation not confirmed.");
}
