# =============================================================================
# Meldex AI — Multi-stage Dockerfile
# =============================================================================
# Stage 1  deps     — install all dependencies
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

# Install all deps (devDeps needed for build + postinstall runs prisma generate)
RUN npm ci

# ── Stage 2: build ───────────────────────────────────────────────────────────
FROM base AS builder
RUN apk add --no-cache openssl

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client before building
RUN npx prisma generate

# Build with standalone output for a minimal runtime image.
# Dummy env vars satisfy the build-phase env checks (not used at runtime).
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV NEXTAUTH_SECRET="build-placeholder-secret"
ENV NEXTAUTH_URL="http://localhost:3000"
ENV DOCKER_BUILD="1"

RUN npm run build

# ── Stage 3: production runner ───────────────────────────────────────────────
FROM base AS runner
RUN apk add --no-cache openssl

# Run as a non-root user
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# Copy standalone Next.js server
COPY --from=builder /app/public                              ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static     ./.next/static

# Copy Prisma schema + migrations so `prisma migrate deploy` works at startup.
# The prisma CLI binary is included in the standalone node_modules.
COPY --from=builder /app/prisma ./prisma

# Ensure prisma CLI is available in the standalone node_modules.
# The standalone bundle traces runtime deps; prisma CLI is a devDep so we
# copy just the CLI binary separately.
COPY --from=deps /app/node_modules/.bin/prisma              ./node_modules/.bin/prisma
COPY --from=deps /app/node_modules/prisma                   ./node_modules/prisma
COPY --from=deps /app/node_modules/@prisma                  ./node_modules/@prisma

RUN chown -R nextjs:nodejs ./node_modules/.bin/prisma ./node_modules/prisma ./node_modules/@prisma

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV NEXT_TELEMETRY_DISABLED=1

# Run DB migrations then start the standalone server
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node server.js"]
