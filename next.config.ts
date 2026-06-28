import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: process.cwd(),
  // instrumentation.ts is automatically enabled in Next.js 15 (stable).
  // vault-loader runs at startup via instrumentation.ts before auth.ts initializes.
  // Enable standalone output for Docker deployments
  output: process.env.DOCKER_BUILD === "1" ? "standalone" : undefined,

  // ── Production-grade HTTP security headers ─────────────────────────────
  async headers() {
    return [
      {
        source: "/((?!api/workspaces/[^/]+/preview).*)",
        headers: [
          // Prevent content-type sniffing
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Prevent clickjacking
          { key: "X-Frame-Options", value: "DENY" },
          // XSS protection (legacy browsers)
          { key: "X-XSS-Protection", value: "1; mode=block" },
          // Referrer policy
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Permissions policy — disable microphone/camera/geolocation by default
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          // HSTS — enforce HTTPS in production (1 year)
          ...(process.env.NODE_ENV === "production"
            ? [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=31536000; includeSubDomains; preload",
                },
              ]
            : []),
          // Content Security Policy
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // Scripts: self + inline (needed by Next.js hydration)
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              // Styles: self + inline (Tailwind, Monaco editor)
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              // Fonts
              "font-src 'self' https://fonts.gstatic.com",
              // Images: self + data URIs + generated/provider image URLs
              `img-src 'self' data: blob: https: ${process.env.R2_PUBLIC_URL ?? ""}`,
              // Connect: self + OpenRouter + Ollama + auth providers + Google OAuth
              "connect-src 'self' https://openrouter.ai https://api.openai.com https://api.anthropic.com https://accounts.google.com https://oauth2.googleapis.com",
              // Worker: blob (Monaco editor web workers)
              "worker-src blob:",
              // Frame: deny
              "frame-ancestors 'none'",
              // Form submissions: self only
              "form-action 'self'",
              // Base URI: self
              "base-uri 'self'",
            ]
              .filter(Boolean)
              .join("; "),
          },
        ],
      },
      {
        source: "/api/workspaces/:id/preview",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Content-Security-Policy",
            value: "default-src 'self' 'unsafe-inline' data: blob:; img-src 'self' data: blob: https:; font-src 'self' data: https:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; frame-ancestors 'self'; base-uri 'self'",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
