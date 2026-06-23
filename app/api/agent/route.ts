import { NextResponse } from "next/server";
import { runAgent } from "@/lib/agent";
import { executeTerminalCommand } from "@/lib/terminal";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      task?: string;
      baseUrl?: string;
      model?: string;
    };

    if (!body.task?.trim()) {
      return NextResponse.json({ error: "Task is required." }, { status: 400 });
    }

    const result = await runAgent(body.task, {
      baseUrl: body.baseUrl,
      model: body.model,
      runCommand: executeTerminalCommand
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Agent task failed" }, { status: 400 });
  }
}
