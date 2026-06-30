import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/role-guard";
import { getUserCreditBalance } from "@/lib/plans-credits";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export async function GET(request: Request) {
  const { session, error } = await requireAuth();
  if (error) return error;
  try {
    const { searchParams } = new URL(request.url);
    const usage = await getUserCreditBalance(session.user.id);
    const transactions = await prisma.creditTransaction.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    if (searchParams.get("format") === "csv") {
      const rows = [
        ["date", "type", "credits", "reason", "provider", "model", "workspaceId", "taskId"],
        ...transactions.map((tx) => {
          const meta = (tx.metadataJson || {}) as Record<string, unknown>;
          return [tx.createdAt.toISOString(), tx.type, tx.credits, tx.reason || "", meta.provider || "", meta.model || "", meta.workspaceId || "", meta.taskId || ""];
        }),
      ];
      return new Response(rows.map((row) => row.map(csvEscape).join(",")).join("\n"), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": "attachment; filename=meldex-usage.csv",
          "Cache-Control": "no-store",
        },
      });
    }
    return NextResponse.json({ usage, transactions }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to load usage" }, { status: 400 });
  }
}
