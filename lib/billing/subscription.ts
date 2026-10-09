import "server-only";

import { recordRecruitingEvent } from "@/lib/analytics/recruiting-server";
import { CREDIT_PLANS, TRIAL_CREDITS, TRIAL_DAYS, type FixedMonthlyPlan } from "@/lib/billing/plans";
import { planForStripePriceId, VERIFIED_PRICE_IDS, type CheckoutPlanId } from "@/lib/billing/payment-links";
import { stripeRequest } from "@/lib/billing/stripe-api";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { SAAS_TERMS_REVIEW, SAAS_TERMS_VERSION } from "@/lib/legal/policy";

export const RECRUITING_BILLING_KIND = "recruiting_subscription_v1";
export class BillingError extends Error {
  constructor(readonly code: string, readonly status = 409) { super(code); }
}

export function checkoutPlan(value: unknown): CheckoutPlanId | null {
  return value === "basic" || value === "pro" || value === "business" ? value : null;
}

export function trialCreditAllowance(): number {
  // Change the shared catalogue to change the offer. An environment override
  // would silently make the public 90-credit promise disagree with checkout.
  return TRIAL_CREDITS;
}

export function stripePriceForPlan(plan: CheckoutPlanId): string {
  // The environment wins. With a live key the verified live prices are the
  // fallback, as for incoming webhooks; startSubscriptionCheckout still checks
  // amount, currency and interval at Stripe before any session is created.
  const liveKey = /^(sk|rk)_live_/u.test(process.env.STRIPE_SECRET_KEY?.trim() ?? "");
  const price = process.env[`STRIPE_${plan.toUpperCase()}_PRICE_ID`]?.trim() || (liveKey ? VERIFIED_PRICE_IDS[plan] : undefined);
  if (!price || !/^price_[A-Za-z0-9]+$/u.test(price)) throw new BillingError("price_not_configured", 503);
  return price;
}

export function stripeObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}
export function stripeId(value: unknown, prefix: string): string | null {
  const id = typeof value === "string" ? value : stripeObject(value).id;
  return typeof id === "string" && new RegExp(`^${prefix}_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*$`, "u").test(id) ? id : null;
}
export function stripeInstant(value: unknown): string | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? new Date(value * 1_000).toISOString() : null;
}

type CheckoutAttempt = {
  request_key: string; plan_id: CheckoutPlanId; session_id: string | null;
  session_url: string | null; customer_id: string | null; trial_eligible: boolean;
  expires_at: string;
};

export async function startSubscriptionCheckout(userId: string, plan: CheckoutPlanId, origin: string): Promise<string> {
  if (!SAAS_TERMS_REVIEW.checkoutEnabled && !/^(sk|rk)_test_/u.test(process.env.STRIPE_SECRET_KEY?.trim() ?? "")) {
    throw new BillingError("legal_review_pending", 503);
  }
  const price = stripePriceForPlan(plan);
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.rpc("prepare_recruiting_checkout", { p_user_id: userId, p_plan_id: plan, p_terms_version: SAAS_TERMS_VERSION });
  if (error) {
    const message = String(error.message ?? "");
    throw new BillingError(message.includes("email_not_verified") ? "email_not_verified"
      : message.includes("subscription_exists") ? "subscription_exists" : "checkout_unavailable", 409);
  }
  const attempt = (Array.isArray(data) ? data[0] : data) as CheckoutAttempt | null;
  if (!attempt?.request_key) throw new BillingError("checkout_unavailable", 503);
  if (attempt.session_url) return attempt.session_url;
  // A concurrent request may have already selected another plan. Reuse that
  // exact attempt and idempotency parameters rather than create two sessions.
  const selectedPrice = attempt.plan_id === plan ? price : stripePriceForPlan(attempt.plan_id);
  const catalogue = CREDIT_PLANS[attempt.plan_id];
  const actualPrice = await stripeRequest<Record<string, unknown>>("GET", `/prices/${selectedPrice}`);
  const recurring = stripeObject(actualPrice.recurring);
  if (actualPrice.active !== true || actualPrice.currency !== "eur" || actualPrice.unit_amount !== catalogue.priceNetCents
    || recurring.interval !== "month" || recurring.interval_count !== 1 || actualPrice.tax_behavior === "inclusive") {
    throw new BillingError("price_catalogue_mismatch", 503);
  }
  let customer = attempt.customer_id;
  if (!customer) {
    const { data: authData, error: authError } = await admin.auth.admin.getUserById(userId);
    if (authError || !authData.user?.email_confirmed_at || !authData.user.email || authData.user.is_anonymous) {
      throw new BillingError("email_not_verified", 403);
    }
    const created = await stripeRequest<Record<string, unknown>>("POST", "/customers", {
      email: authData.user.email, metadata: { xportal_user_id: userId, xportal_kind: RECRUITING_BILLING_KIND },
    }, { idempotencyKey: `xportal-customer-${userId}` });
    customer = stripeId(created.id, "cus");
    if (!customer) throw new BillingError("invalid_stripe_customer", 503);
    const saved = await admin.rpc("save_recruiting_checkout_customer", {
      p_user_id: userId, p_request_key: attempt.request_key, p_customer_id: customer,
    });
    if (saved.error) throw saved.error;
  }
  // Always collect a payment method: a zero trial invoice must still collect
  // one. Stripe chooses the eligible methods configured in the Dashboard.
  // No automatic_tax switch without configured registrations.
  const session = await stripeRequest<Record<string, unknown>>("POST", "/checkout/sessions", {
    mode: "subscription", customer, client_reference_id: userId,
    line_items: [{ price: selectedPrice, quantity: 1 }],
    payment_method_collection: "always",
    billing_address_collection: "required", tax_id_collection: { enabled: true },
    customer_update: { address: "auto", name: "auto" },
    expires_at: Math.floor(Date.parse(attempt.expires_at) / 1_000),
    success_url: `${origin}/chat?billing=success`, cancel_url: `${origin}/preise?billing=cancelled`,
    metadata: { xportal_kind: RECRUITING_BILLING_KIND, xportal_user_id: userId, xportal_checkout_key: attempt.request_key, xportal_terms_version: SAAS_TERMS_VERSION },
    subscription_data: {
      ...(attempt.trial_eligible ? { trial_period_days: TRIAL_DAYS, trial_settings: { end_behavior: { missing_payment_method: "cancel" } } } : {}),
      metadata: { xportal_kind: RECRUITING_BILLING_KIND, xportal_user_id: userId, xportal_checkout_key: attempt.request_key, xportal_terms_version: SAAS_TERMS_VERSION },
    },
    custom_text: { submit: { message: attempt.trial_eligible
      ? `14 Tage kostenlos, einmalig ${trialCreditAllowance()} Credits. Danach ${catalogue.euro} EUR netto/Monat. Automatische Verlängerung; im Konto vor Testende kündbar. Keine Vermittlungsgebühr.`
      : `${catalogue.euro} EUR netto/Monat. Monatlich kündbar. Keine Vermittlungsgebühr.` } },
  }, { idempotencyKey: `xportal-checkout-${attempt.request_key}` });
  const sessionId = stripeId(session.id, "cs");
  const url = typeof session.url === "string" ? session.url : null;
  if (!sessionId || !url || !url.startsWith("https://checkout.stripe.com/")) throw new BillingError("invalid_stripe_checkout", 503);
  const saved = await admin.rpc("save_recruiting_checkout_session", {
    p_user_id: userId, p_request_key: attempt.request_key, p_session_id: sessionId, p_session_url: url,
  });
  if (saved.error) throw saved.error;
  await recordRecruitingEvent({ event: "checkout_started", userId, entityId: sessionId, plan: attempt.plan_id, livemode: session.livemode === true });
  return url;
}

export type SubscriptionSyncResult = { userId: string; plan: FixedMonthlyPlan; isRecruiting: boolean; trialActivated: boolean; paidActivated: boolean; firstPayment: boolean; cancelled: boolean; trialEnd: string | null; accessUntil: string | null };

/** Fetch current objects. Webhook payload snapshots are never the entitlement authority. */
export async function syncStripeSubscription(subscriptionId: string, eventId: string, eventType: string, checkoutSessionId?: string): Promise<SubscriptionSyncResult> {
  const observedAt = new Date().toISOString();
  const subscription = await stripeRequest<Record<string, unknown>>("GET", `/subscriptions/${subscriptionId}`, {
    expand: ["default_payment_method", "latest_invoice.payment_intent", "customer"],
  });
  const metadata = stripeObject(subscription.metadata);
  const items = stripeObject(subscription.items).data;
  const item = stripeObject(Array.isArray(items) ? items[0] : null);
  const priceId = stripeId(item.price, "price");
  const plan = planForStripePriceId(priceId);
  if (!plan) throw new BillingError("unknown_price", 400);
  const admin = createAdminSupabaseClient();
  let userId: string | null = null;
  if (metadata.xportal_kind === RECRUITING_BILLING_KIND && typeof metadata.xportal_user_id === "string") userId = metadata.xportal_user_id;
  const linked = await admin.from("user_ai_credit_accounts").select("user_id,stripe_subscription_id,stripe_customer_id")
    .eq("stripe_subscription_id", subscriptionId).maybeSingle();
  if (linked.error) throw linked.error;
  const linkedRow = linked.data as { user_id: string } | null;
  userId = linkedRow?.user_id ?? userId;
  if (!userId) throw new BillingError("unassigned_subscription", 503);
  if (!checkoutSessionId && metadata.xportal_kind === RECRUITING_BILLING_KIND) {
    const attempt = await admin.from("recruiting_checkout_attempts").select("session_id")
      .eq("user_id", userId).maybeSingle();
    if (attempt.error) throw attempt.error;
    checkoutSessionId = (attempt.data as { session_id?: string } | null)?.session_id;
  }
  let verifiedCheckout = false;
  if (checkoutSessionId) {
    const session = await stripeRequest<Record<string, unknown>>("GET", `/checkout/sessions/${checkoutSessionId}`);
    verifiedCheckout = session.status === "complete" && session.mode === "subscription"
      && session.client_reference_id === userId && stripeId(session.subscription, "sub") === subscriptionId
      && stripeId(session.customer, "cus") === stripeId(subscription.customer, "cus")
      && stripeObject(session.metadata).xportal_kind === RECRUITING_BILLING_KIND
      && stripeObject(session.metadata).xportal_checkout_key === metadata.xportal_checkout_key;
    if (!verifiedCheckout && !linkedRow) throw new BillingError("checkout_not_completed", 409);
  }
  const customer = stripeObject(subscription.customer);
  const paymentMethod = stripeObject(subscription.default_payment_method);
  const customerPaymentMethod = stripeId(stripeObject(customer.invoice_settings).default_payment_method, "pm");
  let cardCollected = paymentMethod.type === "card";
  const subscriptionPaymentMethod = stripeId(subscription.default_payment_method, "pm");
  if (!cardCollected && subscriptionPaymentMethod) {
    const method = await stripeRequest<Record<string, unknown>>("GET", `/payment_methods/${subscriptionPaymentMethod}`);
    cardCollected = method.type === "card";
  }
  if (!cardCollected && customerPaymentMethod) {
    const method = await stripeRequest<Record<string, unknown>>("GET", `/payment_methods/${customerPaymentMethod}`);
    cardCollected = method.type === "card";
  }
  let invoice = stripeObject(subscription.latest_invoice);
  const latestInvoiceId = stripeId(subscription.latest_invoice, "in");
  if (latestInvoiceId && !invoice.status) invoice = await stripeRequest<Record<string, unknown>>("GET", `/invoices/${latestInvoiceId}`);
  const invoiceId = stripeId(invoice.id, "in");
  const paidAmount = invoice.status === "paid" && invoice.paid === true && typeof invoice.amount_paid === "number" ? invoice.amount_paid : 0;
  const lines = stripeObject(invoice.lines).data;
  const billedLine = (Array.isArray(lines) ? lines : []).map(stripeObject).find((line) => {
    const id = stripeId(line.price, "price") ?? stripeId(stripeObject(stripeObject(line.pricing).price_details).price, "price");
    return id === priceId && line.type !== "invoiceitem" && line.proration !== true
      && stripeObject(stripeObject(line.parent).subscription_item_details).proration !== true;
  });
  const invoicePeriod = stripeObject(billedLine?.period);
  const periodStart = stripeInstant(invoicePeriod.start);
  const periodEnd = stripeInstant(invoicePeriod.end);
  const trialEnd = stripeInstant(subscription.trial_end);
  const paymentIntent = stripeObject(invoice.payment_intent);
  const invoiceStatus = invoice.status === "open" && paymentIntent.status === "requires_action"
    ? "payment_action_required" : invoice.status === "open" && invoice.attempted === true
      ? "payment_failed" : typeof invoice.status === "string" ? invoice.status : null;
  const { data, error } = await admin.rpc("sync_recruiting_subscription", {
    p_user_id: userId, p_event_id: eventId, p_event_type: eventType,
    p_observed_at: observedAt,
    p_subscription_id: subscriptionId, p_customer_id: stripeId(subscription.customer, "cus"),
    p_plan_id: plan.id, p_status: subscription.status,
    p_cancel_at_period_end: subscription.cancel_at_period_end === true,
    p_trial_start: stripeInstant(subscription.trial_start), p_trial_end: trialEnd,
    p_card_collected: cardCollected, p_checkout_verified: verifiedCheckout,
    p_checkout_session_id: checkoutSessionId ?? null,
    p_checkout_key: typeof metadata.xportal_checkout_key === "string" ? metadata.xportal_checkout_key : null,
    p_trial_credits: trialCreditAllowance(), p_invoice_id: invoiceId,
    p_invoice_status: invoiceStatus,
    p_amount_paid: paidAmount, p_paid_period_start: periodStart, p_paid_period_end: periodEnd,
  });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as { trial_activated?: boolean; paid_activated?: boolean; first_payment?: boolean; cancelled?: boolean; access_until?: string } | null;
  const result: SubscriptionSyncResult = { userId, plan, isRecruiting: metadata.xportal_kind === RECRUITING_BILLING_KIND, trialActivated: row?.trial_activated === true, paidActivated: row?.paid_activated === true,
    firstPayment: row?.first_payment === true, cancelled: row?.cancelled === true, trialEnd, accessUntil: row?.access_until ?? null };
  const livemode = subscription.livemode === true;
  if (result.trialActivated) await recordRecruitingEvent({ event: "trial_activated", userId, entityId: subscriptionId, plan: plan.id, livemode });
  if (result.paidActivated && invoiceId) await recordRecruitingEvent({ event: result.firstPayment ? "first_payment" : "subscription_renewed", userId, entityId: invoiceId, plan: plan.id, livemode });
  if (result.cancelled) await recordRecruitingEvent({ event: subscription.status === "trialing" ? "trial_cancelled" : "subscription_cancelled", userId, entityId: subscriptionId, plan: plan.id, livemode });
  return result;
}
