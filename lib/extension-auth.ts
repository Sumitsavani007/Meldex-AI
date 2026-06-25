/**
 * lib/extension-auth.ts
 * Auth for the VS Code extension — two methods:
 *   1. JWT  (legacy, kept for backward compat)
 *   2. Raw API token  mdx_<64 hex chars>  (new, preferred)
 */

import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";

// ── Helpers ───────────────────────────────────────────────────────────────────

function getSecret() {
  const raw = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!raw) throw new Error("AUTH_SECRET not set");
  return new TextEncoder().encode(raw);
}

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function generateRawToken(): string {
  return "mdx_" + randomBytes(32).toString("hex"); // mdx_ + 64 hex = 68 chars
}

// ── JWT path (email + password → JWT) ────────────────────────────────────────

export async function authenticateExtension(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user || !user.passwordHash) throw new Error("Invalid email or password");

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw new Error("Invalid email or password");

  const token = await new SignJWT({
    sub: user.id,
    email: user.email,
    role: user.role,
    name: user.name ?? "",
    type: "extension_token",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(getSecret());

  return {
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  };
}

export async function verifyExtensionToken(token: string) {
  const { payload } = await jwtVerify(token, getSecret());
  if (payload.type !== "extension_token") throw new Error("Not an extension token");
  return {
    userId: payload.sub!,
    email: payload.email as string,
    role: payload.role as string,
    name: payload.name as string,
  };
}

// ── Raw API token path  (mdx_xxx → DB lookup) ────────────────────────────────

export async function createExtensionApiToken(userId: string, name?: string) {
  const raw = generateRawToken();
  const tokenHash = hashToken(raw);
  const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year

  await prisma.extensionToken.create({
    data: { userId, tokenHash, name: name ?? "VS Code Extension", expiresAt },
  });

  return raw; // return ONCE — never stored raw
}

export async function verifyApiToken(raw: string): Promise<{
  userId: string; email: string; name: string | null; role: string;
}> {
  if (!raw.startsWith("mdx_")) throw new Error("Invalid token format");
  const tokenHash = hashToken(raw);

  const record = await prisma.extensionToken.findUnique({
    where: { tokenHash },
    include: { user: { select: { id: true, email: true, name: true, role: true } } },
  });

  if (!record) throw new Error("Invalid token");
  if (record.revokedAt) throw new Error("Token has been revoked");
  if (record.expiresAt && record.expiresAt < new Date()) throw new Error("Token has expired");

  // update lastUsedAt (fire and forget)
  prisma.extensionToken.update({
    where: { id: record.id },
    data: { lastUsedAt: new Date() },
  }).catch(() => {});

  return {
    userId: record.user.id,
    email: record.user.email,
    name: record.user.name,
    role: record.user.role,
  };
}

// ── Universal verify — handles both JWT and mdx_ tokens ──────────────────────

export async function verifyAnyExtensionToken(token: string): Promise<{
  userId: string; email: string; name: string | null; role: string;
}> {
  if (token.startsWith("mdx_")) {
    return verifyApiToken(token);
  }
  const j = await verifyExtensionToken(token);
  return { userId: j.userId, email: j.email, name: j.name, role: j.role };
}

/** Extract Bearer token from Authorization header */
export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.slice(7).trim() || null;
}

