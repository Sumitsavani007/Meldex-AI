import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: process.cwd(),
  // Enable standalone output for Docker deployments
  output: process.env.DOCKER_BUILD === "1" ? "standalone" : undefined,

  // ── Production-grade HTTP security headers ─────────────────────────────
  async headers() {
    return [
      {
        source: "/(.*)",
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
              // Images: self + data URIs + R2 public URL
              `img-src 'self' data: blob: ${process.env.R2_PUBLIC_URL ?? ""}`,
              // Connect: self + OpenRouter + Ollama + auth providers
              "connect-src 'self' https://openrouter.ai https://api.openai.com https://api.anthropic.com",
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
    ];
  },
};

export default nextConfig;
