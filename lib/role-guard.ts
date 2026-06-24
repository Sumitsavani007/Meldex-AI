/**
 * lib/role-guard.ts
 *
 * Server-side helpers to enforce role-based access control in API routes and
 * Server Components.  These functions call `auth()` and throw / return error
 * responses rather than redirecting, so callers can handle them appropriately.
 *
 * Usage in an API route handler:
 *
 *   import { requireAdmin } from "@/lib/role-guard";
 *
 *   export async function GET() {
 *     const { session, error } = await requireAdmin();
 *     if (error) return error;
 *     // … safe to use session.user.id / session.user.role here
 *   }
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import type { Session } from "next-auth";

export type Role = "USER" | "ADMIN" | "OWNER";

type GuardResult =
  | { session: Session; error: null }
  | { session: null; error: NextResponse };

/**
 * Returns the current session or an error Response.
 * Use this for any authenticated route regardless of role.
 */
export async function requireAuth(): Promise<GuardResult> {
  const session = (await auth()) as Session | null;
  if (!session?.user) {
    return {
      session: null,
      error: NextResponse.json({ error: "Authentication required" }, { status: 401 }),
    };
  }
  return { session, error: null };
}

/**
 * Requires ADMIN or OWNER role.
 * Returns the session or a 403 error Response.
 */
export async function requireAdmin(): Promise<GuardResult> {
  const result = await requireAuth();
  if (result.error) return result;

  const role = result.session.user.role as Role;
  if (role !== "ADMIN" && role !== "OWNER") {
    return {
      session: null,
      error: NextResponse.json({ error: "Admin access required" }, { status: 403 }),
    };
  }
  return { session: result.session, error: null };
}

/**
 * Requires the OWNER (super-admin) role only.
 * Returns the session or a 403 error Response.
 */
export async function requireOwner(): Promise<GuardResult> {
  const result = await requireAuth();
  if (result.error) return result;

  const role = result.session.user.role as Role;
  if (role !== "OWNER") {
    return {
      session: null,
      error: NextResponse.json({ error: "Owner access required" }, { status: 403 }),
    };
  }
  return { session: result.session, error: null };
}

/**
 * Checks whether the given role is an admin-level role (ADMIN or OWNER).
 */
export function isAdminRole(role: string | undefined | null): boolean {
  return role === "ADMIN" || role === "OWNER";
}
