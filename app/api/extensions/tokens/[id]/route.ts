/**
 * DELETE /api/extensions/tokens/[id]
 * Revoke (soft-delete) an extension token.
 */
import { NextRequest } from "next/server";
import { DELETE as deleteAccountToken } from "@/app/api/account/tokens/[id]/route";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return deleteAccountToken(_req, { params });
}
