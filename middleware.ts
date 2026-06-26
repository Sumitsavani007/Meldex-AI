/**
 * middleware.ts
 *
 * Runs in the Edge Runtime — must only import Edge-compatible modules.
 * Auth logic is provided by the lightweight authConfig (no Prisma/bcryptjs).
 */
import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Unauthenticated: redirect to login (authorized callback handles this, but
  // we keep an explicit redirect to attach the callbackUrl param).
  if (!req.auth) {
    const protectedPaths = [
      "/dashboard",
      "/chat",
      "/workspace",
      "/settings",
      "/admin",
    ];
    const isProtected = protectedPaths.some((p) => pathname.startsWith(p));
    if (isProtected) {
      const loginUrl = new URL(pathname.startsWith("/admin") ? "/master/login" : "/login", req.url);
      loginUrl.searchParams.set("callbackUrl", `${pathname}${req.nextUrl.search}`);
      return Response.redirect(loginUrl);
    }
  }

  // Admin access check (role guard)
  if (pathname.startsWith("/admin")) {
    const role = (req.auth?.user as { role?: string } | undefined)?.role;
    if (role !== "ADMIN" && role !== "OWNER") {
      return Response.redirect(new URL("/unauthorized", req.url));
    }
  }
});

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - api/auth (NextAuth endpoints)
     * - _next/static, _next/image (Next.js internals)
     * - favicon.ico
     */
    "/((?!api/auth|_next/static|_next/image|favicon.ico).*)",
  ],
};
