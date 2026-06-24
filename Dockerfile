# =============================================================================
# Meldex AI — Multi-stage Dockerfile
# =============================================================================
# Stage 1  deps     — install production dependencies only
# Stage 2  builder  — build the Next.js application
# Stage 3  runner   — minimal runtime image
# =============================================================================

# ── Base image ───────────────────────────────────────────────────────────────
ARG NODE_VERSION=22
FROM node:${NODE_VERSION}-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ── Stage 1: install deps ────────────────────────────────────────────────────
FROM base AS deps
RUN apk add --no-cache libc6-compat openssl

COPY package.json package-lock.json* ./
COPY prisma ./prisma/

# Install all deps (including devDeps needed for the build)
RUN npm ci

# ── Stage 2: build ───────────────────────────────────────────────────────────
FROM base AS builder
RUN apk add --no-cache openssl

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client before building
RUN npx prisma generate

# Build the Next.js application.
# DATABASE_URL must be set to a real value at build time only when server
# components directly query the DB during static generation.  For this project
# the admin/API routes are all dynamic, so we use a dummy value here.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV NEXTAUTH_SECRET="build-placeholder-secret"
ENV NEXTAUTH_URL="http://localhost:3000"

RUN npm run build

# ── Stage 3: production runner ───────────────────────────────────────────────
FROM base AS runner
RUN apk add --no-cache openssl

# Run as a non-root user
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# Copy only what's needed at runtime
COPY --from=builder /app/public         ./public
COPY --from=builder /app/prisma         ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static     ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV NEXT_TELEMETRY_DISABLED=1

# Run DB migrations then start the server
CMD ["sh", "-c", "npx prisma migrate deploy && node server.js"]
