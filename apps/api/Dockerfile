# ── Build-Stage ──────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

# Workspace-Manifeste zuerst (Layer-Cache für npm ci)
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN npm ci

# Quellcode + Prisma-Client generieren
COPY apps/api apps/api
COPY packages/shared packages/shared
RUN cd apps/api && npx prisma generate

# ── Runtime-Stage ─────────────────────────────────────────────
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app /app
# OpenSSL/psql-Tools für Prisma und pg_dump-Fallbacks
RUN apk add --no-cache openssl

WORKDIR /app/apps/api
EXPOSE 3001
CMD ["npx", "tsx", "src/server.ts"]
