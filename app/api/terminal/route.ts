import { NextResponse } from "next/server";
import { executeTerminalCommand } from "@/lib/terminal";
import { checkRateLimit, isSafeCommand, normalizeCommand, terminalRequestSchema } from "@/lib/security";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    checkRateLimit(request.headers.get("x-forwarded-for") || "local-terminal", 20);
    const body = terminalRequestSchema.parse(await request.json());
    const command = normalizeCommand(body.command);

    if (!isSafeCommand(command)) {
      return NextResponse.json({ error: "Command is not allowlisted or was blocked by policy." }, { status: 400 });
    }

    const result = await executeTerminalCommand(command, {
      autoFix: body.autoFix,
      timeoutMs: body.timeoutMs
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Command execution failed" }, { status: 400 });
  }
}
