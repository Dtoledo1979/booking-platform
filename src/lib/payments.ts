// Payment seams (docs/06). The app already calls these at the right
// moments; until Stripe is connected they do nothing and fees simply stay
// "pending" in the database, visible to both the business and the client.
//
// Server-only: never import from a Client Component.

export function paymentsConnected() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

// Point 6: charge a booking fee (late cancellation or no-show) off-session
// on the location's connected account.
export async function requestFeeCollection(feeId: string | null | undefined): Promise<void> {
  if (!feeId || !paymentsConnected()) return;
  // TODO(stripe): PaymentIntent { off_session: true, confirm: true }
  // on the connected account, idempotency key `fee:${feeId}`.
}

// Point 7: refund a fee that was already charged (waived after the fact,
// or a no-show marked by mistake).
export async function requestFeeRefund(feeId: string | null | undefined): Promise<void> {
  if (!feeId || !paymentsConnected()) return;
  // TODO(stripe): refunds.create on the connected account.
}
