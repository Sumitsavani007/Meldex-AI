import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let billing = await prisma.billing.findUnique({
      where: { userId: session.user.id },
    });

    // Create default billing if doesn't exist
    if (!billing) {
      billing = await prisma.billing.create({
        data: {
          userId: session.user.id,
          plan: "free",
          status: "FREE",
        },
      });
    }

    return NextResponse.json({ billing });
  } catch (error) {
    console.error("Error fetching billing:", error);
    return NextResponse.json(
      { error: "Failed to fetch billing" },
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

    const { plan } = await request.json();

    const billing = await prisma.billing.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        plan,
        status: "ACTIVE",
      },
      update: {
        plan,
      },
    });

    return NextResponse.json({ billing });
  } catch (error) {
    console.error("Error updating billing:", error);
    return NextResponse.json(
      { error: "Failed to update billing" },
      { status: 500 }
    );
  }
}
