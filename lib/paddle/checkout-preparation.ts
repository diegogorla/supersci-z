type Reservation = { state: string; claim_id: string | null; transaction_id: string | null };
type Ports = {
  claim: () => Promise<Reservation>;
  create: () => Promise<string>;
  finish: (claimId: string, transactionId: string) => Promise<void>;
  uncertain: (claimId: string) => Promise<void>;
};
export class CheckoutPreparationError extends Error {}

export async function prepareCheckoutTransaction(ports: Ports) {
  const reservation = await ports.claim();
  if (reservation.state === "ready" && reservation.transaction_id
    && /^txn_[a-z0-9]{26}$/.test(reservation.transaction_id)) return reservation.transaction_id;
  if (reservation.state !== "claimed" || !reservation.claim_id) {
    throw new CheckoutPreparationError(reservation.state === "creating"
      ? "checkout_preparing" : "checkout_reconciliation_required");
  }
  try {
    const transactionId = await ports.create();
    if (!/^txn_[a-z0-9]{26}$/.test(transactionId)) throw new Error("invalid_provider_transaction");
    await ports.finish(reservation.claim_id, transactionId);
    return transactionId;
  } catch {
    // Paddle has no idempotency-key support. Even a timeout can mean it created
    // the transaction. Keep this reservation blocked until reconciliation.
    await ports.uncertain(reservation.claim_id).catch(() => undefined);
    throw new CheckoutPreparationError("checkout_reconciliation_required");
  }
}
