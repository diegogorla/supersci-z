export type BillableSubscription = {
  id: string;
  status: string;
  scheduled_change?: { action?: string; effective_at?: string } | null;
  current_billing_period?: { ends_at?: string } | null;
};
type Ports = {
  list: () => Promise<BillableSubscription[]>;
  cancel: (subscription: BillableSubscription, immediately: boolean) => Promise<BillableSubscription>;
  persist: (subscription: BillableSubscription) => Promise<void>;
};
const recurringStatuses = new Set(["trialing", "active", "past_due", "paused"]);

// No database or provider access here: production supplies authenticated,
// account-scoped ports. Tests can verify partial failure and retry behavior.
export async function cancelRecurringBatch(ports: Ports, immediately: boolean) {
  const subscriptions = await ports.list();
  const failures: string[] = [];
  let completed = 0;
  for (const subscription of subscriptions) {
    try {
      let result = subscription;
      if (recurringStatuses.has(subscription.status)) {
        const cancelNow = immediately || subscription.status === "paused";
        if (cancelNow || subscription.scheduled_change?.action !== "cancel") {
          result = await ports.cancel(subscription, cancelNow);
        }
        if (cancelNow ? result.status !== "canceled" : result.status !== "canceled" && result.scheduled_change?.action !== "cancel") {
          throw new Error("provider_cancellation_not_confirmed");
        }
      }
      await ports.persist(result);
      completed += 1;
    } catch {
      // Keep trying the remaining subscriptions even if one provider call fails.
      failures.push(subscription.id);
    }
  }
  const fresh = await ports.list();
  const unresolved = fresh.filter((subscription) => recurringStatuses.has(subscription.status)
    && (immediately || subscription.scheduled_change?.action !== "cancel"));
  return {
    completed,
    failed: failures.length,
    unresolved: unresolved.length,
    verified: failures.length === 0 && unresolved.length === 0,
  };
}
