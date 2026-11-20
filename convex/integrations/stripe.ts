// Stripe TEST-mode charge (minimal version so the 1:30 milestone works; Keanu owns this file
// and may extend it, keeping the same exported signature).
// Plain fetch to the Stripe REST API, no SDK, so it runs in the default Convex runtime.

export function assertTestKey(): string {
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  if (!key.startsWith("sk_test_") && !key.startsWith("rk_test_")) {
    throw new Error("STRIPE_SECRET_KEY must be a TEST key (sk_test_ or rk_test_). Refusing to charge.");
  }
  return key;
}

export async function createTestCharge(args: {
  amountCents: number;
  idempotencyKey: string;
  metadata: Record<string, string>;
}): Promise<{ paymentIntentId: string; status: string; amountCents: number }> {
  const key = assertTestKey();
  if (!Number.isInteger(args.amountCents) || args.amountCents < 50) {
    throw new Error(`invalid amountCents ${args.amountCents}`);
  }
  const form = new URLSearchParams({
    amount: String(args.amountCents),
    currency: "usd",
    payment_method: "pm_card_visa", // Stripe's built-in test card
    confirm: "true",
    "automatic_payment_methods[enabled]": "true",
    "automatic_payment_methods[allow_redirects]": "never",
    description: "Hey Boot demo order (test mode)",
  });
  for (const [k, v] of Object.entries(args.metadata)) form.set(`metadata[${k}]`, v);

  const res = await fetch("https://api.stripe.com/v1/payment_intents", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": args.idempotencyKey,
    },
    body: form,
  });
  const body = (await res.json()) as {
    id?: string;
    status?: string;
    amount?: number;
    livemode?: boolean;
    error?: { message?: string };
  };
  if (!res.ok || !body.id) throw new Error(`Stripe ${res.status}: ${body.error?.message ?? "unknown error"}`);
  if (body.livemode) throw new Error("Stripe returned a LIVE-mode object; aborting.");
  return { paymentIntentId: body.id, status: body.status ?? "unknown", amountCents: body.amount ?? args.amountCents };
}
