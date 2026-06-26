/**
 * POST /api/admin/master/test
 * Body: { provider: "postgres" | "r2" | "openrouter" | "google" | "github" | "aws" }
 * Only ADMIN/OWNER can call this.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/role-guard";
import { prisma } from "@/lib/prisma";
import { getProviderConfig, getRuntimeSetting } from "@/lib/runtime-config";
import { testOpenRouterHealth } from "@/lib/provider-health";

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
        const cfg = await getProviderConfig("r2") as {
          accountId?: string; accessKeyId?: string; secretAccessKey?: string; bucket?: string; publicUrl?: string;
        };
        const { accountId, accessKeyId: accessKey, secretAccessKey: secretKey, bucket, publicUrl } = cfg;

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
        const health = await testOpenRouterHealth();
        return NextResponse.json({
          provider,
          status: health.ok ? "ok" : "error",
          latencyMs: health.latencyMs,
          message: health.userMessage,
          lastCheckedAt: new Date().toISOString(),
          extra: {
            model: health.model,
            code: health.code,
            statusCode: String(health.statusCode ?? ""),
            requestId: health.requestId ?? "",
            retryAfter: health.retryAfter ?? "",
            reason: health.reason,
          },
        });
      }

      case "google": {
        const { clientId, clientSecret } = await getProviderConfig("google") as { clientId?: string; clientSecret?: string };

        const appUrl = await getRuntimeSetting("APP_PUBLIC_URL") ?? process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";
        const callbackUrl = `${appUrl}/api/auth/callback/google`;
        const origin = appUrl;

        if (!clientId && !clientSecret) {
          return NextResponse.json({
            provider,
            status: "misconfigured",
            latencyMs: Date.now() - start,
            message: "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET not set. Add via Master Panel.",
            lastCheckedAt: new Date().toISOString(),
            extra: {
              reason: "missing_client_id_and_secret",
              callbackUrl,
              origin,
              requiredEnvVars: "GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET",
            },
          });
        }
        if (!clientId) {
          return NextResponse.json({
            provider, status: "misconfigured", latencyMs: Date.now() - start,
            message: "GOOGLE_CLIENT_ID missing. Add via Master Panel.",
            lastCheckedAt: new Date().toISOString(),
            extra: { reason: "missing_client_id", callbackUrl, origin },
          });
        }
        if (!clientSecret) {
          return NextResponse.json({
            provider, status: "misconfigured", latencyMs: Date.now() - start,
            message: "GOOGLE_CLIENT_SECRET missing. Add via Master Panel.",
            lastCheckedAt: new Date().toISOString(),
            extra: { reason: "missing_client_secret", callbackUrl, origin },
          });
        }

        return NextResponse.json({
          provider,
          status: "configured",
          latencyMs: Date.now() - start,
          message: "Google OAuth configured",
          lastCheckedAt: new Date().toISOString(),
          extra: {
            callbackUrl,
            origin,
            clientIdPrefix: clientId.slice(0, 20) + "...",
          },
        });
      }

      case "github": {
        const { clientId, clientSecret } = await getProviderConfig("github") as { clientId?: string; clientSecret?: string };

        const appUrl = await getRuntimeSetting("APP_PUBLIC_URL") ?? process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";
        const callbackUrl = `${appUrl}/api/auth/callback/github`;

        if (!clientId || !clientSecret) {
          return NextResponse.json({
            provider, status: "misconfigured", latencyMs: Date.now() - start,
            message: `GitHub OAuth credentials missing: ${!clientId ? "GITHUB_ID " : ""}${!clientSecret ? "GITHUB_SECRET" : ""}. Add via Master Panel.`,
            lastCheckedAt: new Date().toISOString(),
            extra: { callbackUrl, reason: "missing_credentials" },
          });
        }

        return NextResponse.json({
          provider,
          status: "configured",
          latencyMs: Date.now() - start,
          message: "GitHub OAuth configured",
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
            region: await getRuntimeSetting("AWS_REGION", "not set"),
            publicIp: await getRuntimeSetting("AWS_PUBLIC_IP", "not set"),
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
