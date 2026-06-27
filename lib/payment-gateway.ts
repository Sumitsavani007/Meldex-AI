import { createHmac, timingSafeEqual } from "crypto";
import { BillingCycle, InvoiceStatus, PaymentEventStatus, PaymentProvider, Prisma, SubscriptionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getConfig } from "@/lib/runtime-config";
import { assignUserPlan, createUserNotification } from "@/lib/plans-credits";

export type PaymentConfig = {
  provider: "manual" | "stripe" | "razorpay";
  mode: "test" | "live";
  currency: string;
  successUrl: string;
  cancelUrl: string;
  taxGstPercent: number;
  stripeConfigured: boolean;
  razorpayConfigured: boolean;
};

type WebhookPayload = Record<string, unknown>;

function asRecord(value: unknown): WebhookPayload {
  return value && typeof value === "object" && !Array.isArray(value) ? value as WebhookPayload : {};
}

function asString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown) {
  return typeof value === "number" ? value : undefined;
}

function asBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function appUrl() {
  return process.env.NEXTAUTH_URL || process.env.APP_PUBLIC_URL || "https://meldex.newsyfly.com";
}

export async function getPaymentConfig(): Promise<PaymentConfig> {
  const provider = ((await getConfig("PAYMENT_PROVIDER", "manual")) || "manual").toLowerCase();
  const mode = ((await getConfig("PAYMENT_MODE", "test")) || "test").toLowerCase();
  const currency = ((await getConfig("PAYMENT_CURRENCY", "USD")) || "USD").toUpperCase();
  const successUrl = await getConfig("PAYMENT_SUCCESS_URL", `${appUrl()}/settings/billing?checkout=success`);
  const cancelUrl = await getConfig("PAYMENT_CANCEL_URL", `${appUrl()}/settings/billing?checkout=cancel`);
  const stripeSecret = await getConfig("STRIPE_SECRET_KEY");
  const razorpayKey = await getConfig("RAZORPAY_KEY_ID");
  const razorpaySecret = await getConfig("RAZORPAY_KEY_SECRET");
  return {
    provider: provider === "stripe" || provider === "razorpay" ? provider : "manual",
    mode: mode === "live" ? "live" : "test",
    currency,
    successUrl: successUrl || `${appUrl()}/settings/billing?checkout=success`,
    cancelUrl: cancelUrl || `${appUrl()}/settings/billing?checkout=cancel`,
    taxGstPercent: Number(await getConfig("PAYMENT_TAX_GST_PERCENT", "0")) || 0,
    stripeConfigured: Boolean(stripeSecret),
    razorpayConfigured: Boolean(razorpayKey && razorpaySecret),
  };
}

function encodeForm(data: Record<string, string | number | boolean | undefined>) {
  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) form.set(key, String(value));
  }
  return form;
}

function planProviderId(plan: { stripePriceIdMonthly?: string | null; stripePriceIdYearly?: string | null; razorpayPlanIdMonthly?: string | null; razorpayPlanIdYearly?: string | null }, provider: "stripe" | "razorpay", cycle: BillingCycle) {
  if (provider === "stripe") return cycle === BillingCycle.YEARLY ? plan.stripePriceIdYearly : plan.stripePriceIdMonthly;
  return cycle === BillingCycle.YEARLY ? plan.razorpayPlanIdYearly : plan.razorpayPlanIdMonthly;
}

export async function createCheckoutSession(input: { userId: string; email?: string | null; planId: string; billingCycle: BillingCycle }) {
  const [config, plan] = await Promise.all([
    getPaymentConfig(),
    prisma.plan.findUnique({ where: { id: input.planId } }),
  ]);
  if (!plan || !plan.isActive) throw new Error("Plan unavailable");
  if (!plan.paymentEnabled) throw new Error("Payments are not enabled for this plan yet.");
  if (config.provider === "manual") throw new Error("Payments are not enabled yet. Request a manual upgrade.");

  const providerPlanId = planProviderId(plan, config.provider, input.billingCycle);
  if (!providerPlanId) throw new Error(`${config.provider === "stripe" ? "Stripe price" : "Razorpay plan"} is not configured for this billing cycle.`);

  if (config.provider === "stripe") {
    const secret = await getConfig("STRIPE_SECRET_KEY");
    if (!secret) throw new Error("Stripe is not configured.");
    const form = encodeForm({
      mode: "subscription",
      "line_items[0][price]": providerPlanId,
      "line_items[0][quantity]": 1,
      success_url: config.successUrl,
      cancel_url: config.cancelUrl,
      customer_email: input.email || undefined,
      "metadata[userId]": input.userId,
      "metadata[planId]": plan.id,
      "metadata[billingCycle]": input.billingCycle,
      "subscription_data[metadata][userId]": input.userId,
      "subscription_data[metadata][planId]": plan.id,
      "subscription_data[metadata][billingCycle]": input.billingCycle,
      "subscription_data[trial_period_days]": plan.trialDays || undefined,
    });
    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error?.message || "Stripe checkout session failed");
    return { provider: "stripe", checkoutUrl: data.url as string, sessionId: data.id as string };
  }

  const keyId = await getConfig("RAZORPAY_KEY_ID");
  const keySecret = await getConfig("RAZORPAY_KEY_SECRET");
  if (!keyId || !keySecret) throw new Error("Razorpay is not configured.");
  const response = await fetch("https://api.razorpay.com/v1/subscriptions", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      plan_id: providerPlanId,
      total_count: input.billingCycle === BillingCycle.YEARLY ? 10 : 120,
      customer_notify: 1,
      notes: { userId: input.userId, planId: plan.id, billingCycle: input.billingCycle },
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.description || "Razorpay subscription creation failed");
  return { provider: "razorpay", checkoutUrl: data.short_url as string, sessionId: data.id as string };
}

function verifyHmac(raw: string, expected: string | null | undefined, secret: string) {
  if (!expected) return false;
  const actual = createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifyStripeSignature(raw: string, signature: string | null, secret: string) {
  if (!signature) return false;
  const parts = Object.fromEntries(signature.split(",").map((item) => {
    const [key, ...rest] = item.split("=");
    return [key, rest.join("=")];
  }));
  const timestamp = parts.t;
  const expected = parts.v1;
  if (!timestamp || !expected) return false;
  return verifyHmac(`${timestamp}.${raw}`, expected, secret);
}

export function verifyRazorpaySignature(raw: string, signature: string | null, secret: string) {
  return verifyHmac(raw, signature, secret);
}

function asDateFromSeconds(value?: number | null) {
  return value ? new Date(value * 1000) : null;
}

function mapStripeStatus(status?: string): SubscriptionStatus {
  if (status === "active") return SubscriptionStatus.ACTIVE;
  if (status === "trialing") return SubscriptionStatus.TRIALING;
  if (status === "past_due") return SubscriptionStatus.PAST_DUE;
  if (status === "canceled") return SubscriptionStatus.CANCELED;
  if (status === "unpaid") return SubscriptionStatus.UNPAID;
  return SubscriptionStatus.INCOMPLETE;
}

function mapInvoiceStatus(status?: string, paid?: boolean): InvoiceStatus {
  if (paid || status === "paid") return InvoiceStatus.PAID;
  if (status === "void") return InvoiceStatus.VOID;
  if (status === "draft") return InvoiceStatus.DRAFT;
  if (status === "open") return InvoiceStatus.OPEN;
  return InvoiceStatus.FAILED;
}

async function activatePlanFromPayment(input: { userId: string; planId: string; provider: PaymentProvider; providerCustomerId?: string | null; providerSubscriptionId?: string | null; billingCycle: BillingCycle; status: SubscriptionStatus; currentPeriodStart?: Date | null; currentPeriodEnd?: Date | null; trialEndsAt?: Date | null; cancelAtPeriodEnd?: boolean }) {
  const subscription = await prisma.subscription.upsert({
    where: { id: `${input.provider.toLowerCase()}_${input.providerSubscriptionId || input.userId}_${input.planId}`.slice(0, 190) },
    update: {
      planId: input.planId,
      providerCustomerId: input.providerCustomerId || null,
      providerSubscriptionId: input.providerSubscriptionId || null,
      status: input.status,
      billingCycle: input.billingCycle,
      currentPeriodStart: input.currentPeriodStart || null,
      currentPeriodEnd: input.currentPeriodEnd || null,
      cancelAtPeriodEnd: Boolean(input.cancelAtPeriodEnd),
      trialEndsAt: input.trialEndsAt || null,
    },
    create: {
      id: `${input.provider.toLowerCase()}_${input.providerSubscriptionId || input.userId}_${input.planId}`.slice(0, 190),
      userId: input.userId,
      planId: input.planId,
      provider: input.provider,
      providerCustomerId: input.providerCustomerId || null,
      providerSubscriptionId: input.providerSubscriptionId || null,
      status: input.status,
      billingCycle: input.billingCycle,
      currentPeriodStart: input.currentPeriodStart || null,
      currentPeriodEnd: input.currentPeriodEnd || null,
      cancelAtPeriodEnd: Boolean(input.cancelAtPeriodEnd),
      trialEndsAt: input.trialEndsAt || null,
    },
    include: { plan: true },
  });
  if (input.status === SubscriptionStatus.ACTIVE || input.status === SubscriptionStatus.TRIALING) {
    await assignUserPlan({ userId: input.userId, planId: input.planId, assignedByAdmin: false, endsAt: input.currentPeriodEnd || null });
    await createUserNotification({
      userId: input.userId,
      type: "subscription_active",
      title: "Subscription active",
      message: `Your ${subscription.plan.name} subscription is active.`,
      metadata: { subscriptionId: subscription.id, provider: input.provider },
    }).catch(() => undefined);
  }
  return subscription;
}

export async function recordPaymentEvent(input: { provider: PaymentProvider; type: string; providerEventId?: string | null; userId?: string | null; amount?: number | null; currency?: string | null; metadata: unknown; status?: PaymentEventStatus }) {
  const providerEventId = input.providerEventId || `${input.provider}-${Date.now()}`;
  return prisma.paymentEvent.upsert({
    where: { provider_providerEventId: { provider: input.provider, providerEventId } },
    update: { status: input.status || PaymentEventStatus.PROCESSED, metadataJson: input.metadata as Prisma.InputJsonValue },
    create: {
      provider: input.provider,
      type: input.type,
      providerEventId,
      userId: input.userId || null,
      amount: input.amount ?? null,
      currency: input.currency || null,
      status: input.status || PaymentEventStatus.PROCESSED,
      metadataJson: input.metadata as Prisma.InputJsonValue,
    },
  });
}

export async function processStripeEvent(event: WebhookPayload) {
  const data = asRecord(event.data);
  const object = asRecord(data.object);
  const metadata = asRecord(object.metadata);
  const eventType = asString(event.type) || "unknown";
  const userId = asString(metadata.userId);
  const planId = asString(metadata.planId);
  const billingCycle = metadata.billingCycle === "YEARLY" ? BillingCycle.YEARLY : BillingCycle.MONTHLY;
  await recordPaymentEvent({ provider: PaymentProvider.STRIPE, type: eventType, providerEventId: asString(event.id), userId, amount: asNumber(object.amount_paid) || asNumber(object.amount_due) || asNumber(object.amount_total) || null, currency: asString(object.currency) || null, metadata: event });

  if (eventType === "checkout.session.completed" && userId && planId) {
    return activatePlanFromPayment({
      userId,
      planId,
      provider: PaymentProvider.STRIPE,
      providerCustomerId: asString(object.customer) || null,
      providerSubscriptionId: asString(object.subscription) || null,
      billingCycle,
      status: SubscriptionStatus.ACTIVE,
    });
  }
  if (eventType.startsWith("customer.subscription.")) {
    const sub = object;
    const subMetadata = asRecord(sub.metadata);
    const subUserId = asString(subMetadata.userId);
    const subPlanId = asString(subMetadata.planId);
    if (subUserId && subPlanId) {
      return activatePlanFromPayment({
        userId: subUserId,
        planId: subPlanId,
        provider: PaymentProvider.STRIPE,
        providerCustomerId: asString(sub.customer) || null,
        providerSubscriptionId: asString(sub.id) || null,
        billingCycle: subMetadata.billingCycle === "YEARLY" ? BillingCycle.YEARLY : BillingCycle.MONTHLY,
        status: mapStripeStatus(asString(sub.status)),
        currentPeriodStart: asDateFromSeconds(asNumber(sub.current_period_start)),
        currentPeriodEnd: asDateFromSeconds(asNumber(sub.current_period_end)),
        trialEndsAt: asDateFromSeconds(asNumber(sub.trial_end)),
        cancelAtPeriodEnd: Boolean(asBoolean(sub.cancel_at_period_end)),
      });
    }
  }
  if (eventType.startsWith("invoice.")) {
    const providerSubscriptionId = asString(object.subscription) || null;
    const subscription = providerSubscriptionId ? await prisma.subscription.findFirst({ where: { provider: PaymentProvider.STRIPE, providerSubscriptionId } }) : null;
    if (subscription) {
      const invoiceId = asString(object.id) || `unknown_${Date.now()}`;
      await prisma.invoice.upsert({
        where: { id: `stripe_invoice_${invoiceId}` },
        update: { status: mapInvoiceStatus(asString(object.status), asBoolean(object.paid)), hostedInvoiceUrl: asString(object.hosted_invoice_url) || null, invoicePdf: asString(object.invoice_pdf) || null },
        create: {
          id: `stripe_invoice_${invoiceId}`,
          userId: subscription.userId,
          planId: subscription.planId,
          subscriptionId: subscription.id,
          provider: PaymentProvider.STRIPE,
          providerInvoiceId: invoiceId,
          amount: asNumber(object.amount_paid) || asNumber(object.amount_due) || 0,
          currency: (asString(object.currency) || "usd").toUpperCase(),
          status: mapInvoiceStatus(asString(object.status), asBoolean(object.paid)),
          hostedInvoiceUrl: asString(object.hosted_invoice_url) || null,
          invoicePdf: asString(object.invoice_pdf) || null,
          metadataJson: object as Prisma.InputJsonValue,
        },
      });
    }
  }
}

export async function processRazorpayEvent(event: WebhookPayload) {
  const payload = asRecord(event.payload);
  const entity = asRecord(asRecord(payload.subscription).entity ?? asRecord(payload.payment).entity ?? asRecord(payload.invoice).entity);
  const notes = asRecord(entity.notes);
  const eventName = asString(event.event) || "unknown";
  const userId = asString(notes.userId);
  const planId = asString(notes.planId);
  await recordPaymentEvent({ provider: PaymentProvider.RAZORPAY, type: eventName, providerEventId: asString(entity.id) || asString(event.id), userId, amount: asNumber(entity.amount) || null, currency: asString(entity.currency) || null, metadata: event });
  if (eventName.startsWith("subscription.") && userId && planId) {
    const entityStatus = asString(entity.status);
    const status = entityStatus === "active" ? SubscriptionStatus.ACTIVE : entityStatus === "cancelled" ? SubscriptionStatus.CANCELED : entityStatus === "completed" ? SubscriptionStatus.EXPIRED : SubscriptionStatus.INCOMPLETE;
    return activatePlanFromPayment({
      userId,
      planId,
      provider: PaymentProvider.RAZORPAY,
      providerSubscriptionId: asString(entity.id),
      billingCycle: notes.billingCycle === "YEARLY" ? BillingCycle.YEARLY : BillingCycle.MONTHLY,
      status,
      currentPeriodStart: asDateFromSeconds(asNumber(entity.current_start)),
      currentPeriodEnd: asDateFromSeconds(asNumber(entity.current_end)),
    });
  }
}
