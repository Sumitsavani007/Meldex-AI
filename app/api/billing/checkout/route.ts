import { NextResponse } from "next/server";
import { z } from "zod";
import { BillingCycle } from "@prisma/client";
import { requireAuth } from "@/lib/role-guard";
import { createCheckoutSession, getPaymentConfig } from "@/lib/payment-gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  planId: z.string().min(1),
  billingCycle: z.enum(["MONTHLY", "YEARLY"]).default("MONTHLY"),
});

export async function POST(request: Request) {
  const { session, error } = await requireAuth();
  if (error) return error;

  try {
    const config = await getPaymentConfig();
    if (config.provider === "manual") {
      return NextResponse.json({ error: "Payments not enabled yet.", provider: "manual" }, { status: 400 });
    }
    const body = schema.parse(await request.json().catch(() => ({})));
    const checkout = await createCheckoutSession({
      userId: session.user.id,
      email: session.user.email,
      planId: body.planId,
      billingCycle: body.billingCycle === "YEARLY" ? BillingCycle.YEARLY : BillingCycle.MONTHLY,
    });
    return NextResponse.json(checkout, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Checkout failed" }, { status: 400 });
  }
}
