# syntax=docker/dockerfile:1
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Nuxt public config is read at RUNTIME from container env (see runtimeConfig in
# nuxt.config.ts); the build needs no app env. deps skipped `nuxt prepare` via
# --ignore-scripts, so run the build directly (it prepares as needed).
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

RUN apk upgrade --no-cache \
    && rm -rf /usr/local/lib/node_modules/npm \
        /usr/local/bin/npm \
        /usr/local/bin/npx \
        /usr/local/bin/corepack

# Nitro node-server output is self-contained (deps bundled in
# .output/server/node_modules) — no separate node_modules stage needed.
COPY --from=builder /app/.output ./.output

EXPOSE 8080
CMD ["node", ".output/server/index.mjs"]
