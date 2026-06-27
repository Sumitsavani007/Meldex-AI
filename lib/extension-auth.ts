/**
 * lib/extension-auth.ts
 * Auth for the Meldex extension — two methods:
 *   1. JWT  (legacy, kept for backward compat)
 *   2. Raw API token  mdx_<64 hex chars>  (new, preferred)
 */

import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { logAuditEvent } from "@/lib/audit";

// ── Helpers ───────────────────────────────────────────────────────────────────

function getSecret() {
  const raw = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!raw) throw new Error("AUTH_SECRET not set");
  return new TextEncoder().encode(raw);
}

export type ExtensionScope = "chat" | "agent" | "model-health" | "benchmark";

export class ExtensionTokenError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "ExtensionTokenError";
  }
}

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function parseScopes(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (value && typeof value === "object" && "scopes" in value) {
    const scopes = (value as { scopes?: unknown }).scopes;
    return Array.isArray(scopes) ? scopes.filter((item): item is string => typeof item === "string") : [];
  }
  return [];
}

export function maskExtensionToken(raw: string) {
  return `${raw.slice(0, 4)}****${raw.slice(-4)}`;
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

export const loginExtensionUser = authenticateExtension;

export async function verifyExtensionToken(token: string) {
  const { payload } = await jwtVerify(token, getSecret());
  if (payload.type !== "extension_token") throw new Error("Not an extension token");
  return {
    userId: payload.sub!,
    email: payload.email as string,
    role: payload.role as string,
    name: payload.name as string,
    expiresAt: typeof payload.exp === "number" ? new Date(payload.exp * 1000) : null,
  };
}

// ── Raw API token path  (mdx_xxx → DB lookup) ────────────────────────────────

export async function createExtensionApiToken(
  userId: string,
  name?: string,
  options?: { expiresAt?: Date | null; scopes?: ExtensionScope[] }
) {
  const raw = generateRawToken();
  const tokenHash = hashToken(raw);
  const expiresAt = options?.expiresAt === undefined
    ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
    : options.expiresAt;
  const scopes = options?.scopes?.length ? options.scopes : ["chat", "agent", "model-health", "benchmark"] satisfies ExtensionScope[];

  const record = await prisma.extensionToken.create({
    data: {
      userId,
      tokenHash,
      tokenPrefix: raw.slice(0, 4),
      tokenLast4: raw.slice(-4),
      scopesJson: { scopes },
      name: name ?? "Meldex Extension",
      expiresAt,
    },
  });
  await logAuditEvent({
    userId,
    action: "EXTENSION_TOKEN_CREATE",
    resource: "ExtensionToken",
    resourceId: record.id,
    success: true,
    metadata: { name: record.name, maskedToken: maskExtensionToken(raw), scopes, expiresAt: expiresAt?.toISOString() ?? null },
  });

  return raw; // return ONCE — never stored raw
}

export async function verifyApiToken(raw: string): Promise<{
  userId: string; email: string; name: string | null; role: string; expiresAt: Date | null; tokenId?: string; scopes: string[];
}> {
  if (!raw.startsWith("mdx_")) throw new ExtensionTokenError("Invalid token format", "token_invalid");
  const tokenHash = hashToken(raw);

  const record = await prisma.extensionToken.findUnique({
    where: { tokenHash },
    include: { user: { select: { id: true, email: true, name: true, role: true } } },
  });

  if (!record || !constantTimeEqual(record.tokenHash, tokenHash)) throw new ExtensionTokenError("Invalid token", "token_invalid");
  if (record.revokedAt) throw new ExtensionTokenError("Token has been revoked", "token_revoked");
  if (record.expiresAt && record.expiresAt < new Date()) throw new ExtensionTokenError("Token has expired", "token_expired");
  const scopes = parseScopes(record.scopesJson) || [];

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
    expiresAt: record.expiresAt,
    tokenId: record.id,
    scopes,
  };
}

export function requireExtensionScope(user: { scopes?: string[] }, scope: ExtensionScope) {
  const scopes = user.scopes || [];
  if (scopes.length && !scopes.includes(scope)) {
    throw new ExtensionTokenError(`Token missing ${scope} scope`, "insufficient_scope");
  }
}

// ── Universal verify — handles both JWT and mdx_ tokens ──────────────────────

export async function verifyAnyExtensionToken(token: string): Promise<{
  userId: string; email: string; name: string | null; role: string; expiresAt?: Date | null; tokenId?: string; scopes?: string[];
}> {
  if (token.startsWith("mdx_")) {
    return verifyApiToken(token);
  }
  const j = await verifyExtensionToken(token);
  return { userId: j.userId, email: j.email, name: j.name, role: j.role, expiresAt: j.expiresAt, scopes: ["chat", "agent", "model-health", "benchmark"] };
}

/** Extract Bearer token from Authorization header */
export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.slice(7).trim() || null;
}

export function bearerToken(request: Request): string {
  const token = extractBearerToken(request.headers.get("authorization"));
  if (!token) throw new Error("Missing Bearer token");
  return token;
}
