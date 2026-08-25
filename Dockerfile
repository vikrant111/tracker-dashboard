# syntax=docker/dockerfile:1

# Multi-stage, so the image that ships carries no compiler, no dev dependencies
# and no source — just the standalone server Next builds.

# ---------------------------------------------------------------- deps ------
FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable pnpm
# Only the manifests, so this layer is cached until a dependency actually changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# --------------------------------------------------------------- build ------
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable pnpm
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# A placeholder, only so the build can import `auth.ts` — which now refuses to
# load without a secret. It never reaches the running image; the real one comes
# from the environment at start.
# Fonts from the repository, so the image builds with no network at all —
# which is also what makes it work behind a TLS-inspecting proxy.
ARG FONT_SOURCE=local
ENV FONT_SOURCE=$FONT_SOURCE
ENV AUTH_SECRET=build-time-placeholder-not-used-at-runtime-000
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm run build

# ----------------------------------------------------------------- run ------
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Not root. A container that is compromised should not also be privileged.
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

# `standalone` carries its own minimal node_modules, so nothing is installed here.
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000

# Readiness, not liveness: this asks whether OpenSearch is reachable, so the
# container is only sent traffic once it can actually answer.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health?ready=1').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
