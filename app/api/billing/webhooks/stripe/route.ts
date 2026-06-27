import { NextResponse } from "next/server";
import { getConfig } from "@/lib/runtime-config";
import { processStripeEvent, verifyStripeSignature } from "@/lib/payment-gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const raw = await request.text();
  const secret = await getConfig("STRIPE_WEBHOOK_SECRET");
  if (!secret) return NextResponse.json({ error: "Stripe webhook is not configured" }, { status: 503 });
  if (!verifyStripeSignature(raw, request.headers.get("stripe-signature"), secret)) {
    return NextResponse.json({ error: "Invalid Stripe signature" }, { status: 400 });
  }
  try {
    const event = JSON.parse(raw);
    await processStripeEvent(event);
    return NextResponse.json({ received: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Stripe webhook failed" }, { status: 400 });
  }
}
