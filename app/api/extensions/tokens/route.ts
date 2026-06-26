/**
 * GET  /api/extensions/tokens  — list user's tokens (masked)
 * DELETE /api/extensions/tokens  — not used; use /[id] route
 */
import { GET as listAccountTokens } from "@/app/api/account/tokens/route";

export async function GET() {
  return listAccountTokens();
}
