import { NextResponse } from "next/server";
import { registerSchema, registerUser } from "@/lib/auth-utils";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    const result = registerSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues[0].message },
        { status: 400 }
      );
    }

    const user = await registerUser(
      result.data.email,
      result.data.name,
      result.data.password
    );

    return NextResponse.json(
      {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Registration failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
