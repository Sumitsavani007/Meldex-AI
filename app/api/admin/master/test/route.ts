/**
 * POST /api/admin/master/test
 * Body: { provider: "postgres" | "r2" | "openrouter" | "google" | "github" | "aws" }
 * Only ADMIN/OWNER can call this.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/role-guard";
import { prisma } from "@/lib/prisma";

const testSchema = z.object({
  provider: z.enum(["postgres", "r2", "openrouter", "google", "github", "aws"]),
});

export async function POST(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const body = testSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
  }

  const { provider } = body.data;
  const start = Date.now();

  try {
    switch (provider) {
      case "postgres": {
        await prisma.$queryRaw`SELECT 1`;
        return NextResponse.json({
          provider,
          status: "ok",
          latencyMs: Date.now() - start,
          message: "PostgreSQL connection successful",
          lastCheckedAt: new Date().toISOString(),
        });
      }

      case "r2": {
        const accountId = process.env.R2_ACCOUNT_ID;
        const accessKey = process.env.R2_ACCESS_KEY_ID;
        const secretKey = process.env.R2_SECRET_ACCESS_KEY;
        const bucket = process.env.R2_BUCKET;
        const publicUrl = process.env.R2_PUBLIC_URL;

        if (!accountId || !accessKey || !secretKey || !bucket) {
          return NextResponse.json({
            provider,
            status: "misconfigured",
            latencyMs: Date.now() - start,
            message: "R2 credentials not set (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET required)",
            lastCheckedAt: new Date().toISOString(),
          });
        }

        // Attempt lightweight R2 head bucket via fetch
        const endpoint = `https://${accountId}.r2.cloudflarestorage.com/${bucket}`;
        const testKey = `.meldex-health-${Date.now()}`;
        const putUrl = `${endpoint}/${testKey}`;

        // Sign request using AWS SigV4 (simplified) — do a quick list objects
        const listUrl = `${endpoint}?max-keys=1`;
        const { S3Client, ListObjectsV2Command } = await import("@aws-sdk/client-s3");
        const client = new S3Client({
          region: "auto",
          endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
          credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
        });
        await client.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1 }));
        void listUrl; void putUrl;

        return NextResponse.json({
          provider,
          status: "ok",
          latencyMs: Date.now() - start,
          message: `R2 bucket '${bucket}' accessible`,
          lastCheckedAt: new Date().toISOString(),
          extra: { publicUrl },
        });
      }

      case "openrouter": {
        const apiKey = process.env.OPENROUTER_API_KEY;
        if (!apiKey) {
          return NextResponse.json({
            provider,
            status: "misconfigured",
            latencyMs: Date.now() - start,
            message: "OPENROUTER_API_KEY not set",
            lastCheckedAt: new Date().toISOString(),
          });
        }

        const res = await fetch("https://openrouter.ai/api/v1/models", {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json() as { data?: unknown[] };
        const modelCount = data?.data?.length ?? 0;

        return NextResponse.json({
          provider,
          status: "ok",
          latencyMs: Date.now() - start,
          message: `OpenRouter connected — ${modelCount} models available`,
          lastCheckedAt: new Date().toISOString(),
        });
      }

      case "google": {
        const clientId = process.env.GOOGLE_CLIENT_ID;
        if (!clientId) {
          return NextResponse.json({
            provider,
            status: "misconfigured",
            latencyMs: Date.now() - start,
            message: "GOOGLE_CLIENT_ID not set. Add to .env.production",
            lastCheckedAt: new Date().toISOString(),
          });
        }
        const callbackUrl = `${process.env.NEXTAUTH_URL ?? process.env.AUTH_URL}/api/auth/callback/google`;
        return NextResponse.json({
          provider,
          status: "configured",
          latencyMs: Date.now() - start,
          message: "Google OAuth client ID present",
          lastCheckedAt: new Date().toISOString(),
          extra: { callbackUrl, clientIdPrefix: clientId.slice(0, 16) + "..." },
        });
      }

      case "github": {
        const clientId = process.env.GITHUB_ID;
        if (!clientId) {
          return NextResponse.json({
            provider,
            status: "misconfigured",
            latencyMs: Date.now() - start,
            message: "GITHUB_ID not set. Add to .env.production",
            lastCheckedAt: new Date().toISOString(),
          });
        }
        const callbackUrl = `${process.env.NEXTAUTH_URL ?? process.env.AUTH_URL}/api/auth/callback/github`;
        return NextResponse.json({
          provider,
          status: "configured",
          latencyMs: Date.now() - start,
          message: "GitHub OAuth client ID present",
          lastCheckedAt: new Date().toISOString(),
          extra: { callbackUrl, clientIdPrefix: clientId.slice(0, 8) + "..." },
        });
      }

      case "aws": {
        return NextResponse.json({
          provider,
          status: "info",
          latencyMs: Date.now() - start,
          message: "AWS metadata (from env)",
          lastCheckedAt: new Date().toISOString(),
          extra: {
            instanceId: process.env.AWS_INSTANCE_ID ?? "not set",
            region: process.env.AWS_REGION ?? "not set",
            publicIp: process.env.AWS_PUBLIC_IP ?? "not set",
            deployPath: process.env.AWS_DEPLOY_PATH ?? "not set",
            sshUser: process.env.AWS_SSH_USER ?? "not set",
            serverName: process.env.AWS_SERVER_NAME ?? "not set",
          },
        });
      }

      default:
        return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({
      provider,
      status: "error",
      latencyMs: Date.now() - start,
      message: err instanceof Error ? err.message : "Connection failed",
      lastCheckedAt: new Date().toISOString(),
    });
  }
}
