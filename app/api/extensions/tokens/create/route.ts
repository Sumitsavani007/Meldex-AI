/**
 * POST /api/extensions/tokens/create
 * Creates a new API token for the authenticated web-session user.
 * Returns the raw token ONCE — it is never stored in DB.
 */
import { NextRequest } from "next/server";
import { POST as createAccountToken } from "@/app/api/account/tokens/route";

export async function POST(req: NextRequest) {
  return createAccountToken(req);
}
