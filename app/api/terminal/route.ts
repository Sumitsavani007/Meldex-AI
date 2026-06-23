import { NextResponse } from "next/server";
import { executeTerminalCommand } from "@/lib/terminal";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      command?: string;
      autoFix?: boolean;
      timeoutMs?: number;
    };

    if (!body.command?.trim()) {
      return NextResponse.json({ error: "Command is required." }, { status: 400 });
    }

    const result = await executeTerminalCommand(body.command, {
      autoFix: body.autoFix,
      timeoutMs: body.timeoutMs
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Command execution failed" }, { status: 400 });
  }
}
