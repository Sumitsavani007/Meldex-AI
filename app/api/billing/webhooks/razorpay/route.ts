import { NextResponse } from "next/server";
import { getConfig } from "@/lib/runtime-config";
import { processRazorpayEvent, verifyRazorpaySignature } from "@/lib/payment-gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const raw = await request.text();
  const secret = await getConfig("RAZORPAY_WEBHOOK_SECRET");
  if (!secret) return NextResponse.json({ error: "Razorpay webhook is not configured" }, { status: 503 });
  if (!verifyRazorpaySignature(raw, request.headers.get("x-razorpay-signature"), secret)) {
    return NextResponse.json({ error: "Invalid Razorpay signature" }, { status: 400 });
  }
  try {
    const event = JSON.parse(raw);
    await processRazorpayEvent(event);
    return NextResponse.json({ received: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Razorpay webhook failed" }, { status: 400 });
  }
}
