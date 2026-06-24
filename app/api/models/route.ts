import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const modelConfigSchema = z.object({
  provider: z.enum(["OLLAMA", "OPENAI", "DEEPSEEK", "ANTHROPIC", "OPENROUTER", "CUSTOM_OPENAI_COMPATIBLE"]),
  name: z.string().min(1),
  model: z.string().min(1),
  baseUrl: z.string().optional(),
  apiKey: z.string().optional(),
  isDefault: z.boolean().default(false),
});

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const models = await prisma.modelConfig.findMany({
      where: { userId: session.user.id },
      select: {
        id: true,
        provider: true,
        name: true,
        model: true,
        baseUrl: true,
        isDefault: true,
      },
    });

    return NextResponse.json({ models });
  } catch (error) {
    console.error("Error fetching models:", error);
    return NextResponse.json(
      { error: "Failed to fetch models" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validated = modelConfigSchema.parse(body);

    // If setting as default, unset others
    if (validated.isDefault) {
      await prisma.modelConfig.updateMany({
        where: { userId: session.user.id, isDefault: true },
        data: { isDefault: false },
      });
    }

    const model = await prisma.modelConfig.create({
      data: {
        userId: session.user.id,
        provider: validated.provider,
        name: validated.name,
        model: validated.model,
        baseUrl: validated.baseUrl,
        encryptedApiKey: validated.apiKey, // In production, this should be encrypted
        isDefault: validated.isDefault,
      },
    });

    return NextResponse.json(model, { status: 201 });
  } catch (error) {
    console.error("Error creating model config:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message || "Invalid input" },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Failed to create model config" },
      { status: 500 }
    );
  }
}
