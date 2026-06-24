/**
 * auth.config.ts — lightweight auth configuration for Next.js middleware.
 *
 * This file MUST NOT import Prisma, bcryptjs, or any other Node.js-only
 * module so that it can run safely in the Edge Runtime used by middleware.ts.
 *
 * The full auth setup (with PrismaAdapter, bcrypt, etc.) lives in auth.ts.
 */
import type { NextAuthConfig } from "next-auth";

export const authConfig: NextAuthConfig = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    error: "/auth/error",
  },
  callbacks: {
    /**
     * The `authorized` callback is called by the middleware helper to decide
     * whether a request is allowed to proceed. It receives only the JWT token
     * (no DB access), which is sufficient for route-guard logic.
     */
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const pathname = nextUrl.pathname;

      const protectedPaths = [
        "/dashboard",
        "/chat",
        "/workspace",
        "/settings",
        "/admin",
      ];

      const isProtected = protectedPaths.some((p) => pathname.startsWith(p));

      if (!isProtected) return true;
      if (!isLoggedIn) return false; // will redirect to signIn page

      // Admin-only paths
      if (pathname.startsWith("/admin")) {
        const role = (auth?.user as { role?: string } | undefined)?.role;
        return role === "ADMIN" || role === "OWNER";
      }

      return true;
    },
  },
  // Providers array is intentionally empty here — they are declared in auth.ts.
  // Next-auth requires at least an empty array to satisfy the type.
  providers: [],
};
