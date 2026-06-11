FROM node:22-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

FROM node:22-alpine AS builder
WORKDIR /app

ARG VITE_ADMIN_BASE_URL
ARG VITE_PUBLIC_BASE_PATH
ARG VITE_SSO_BASE_URL
ARG VITE_ZITADEL_ISSUER_URL
ARG VITE_DOCS_BASE_URL

ENV VITE_ADMIN_BASE_URL=${VITE_ADMIN_BASE_URL}
ENV VITE_PUBLIC_BASE_PATH=${VITE_PUBLIC_BASE_PATH}
ENV VITE_SSO_BASE_URL=${VITE_SSO_BASE_URL}
ENV VITE_ZITADEL_ISSUER_URL=${VITE_ZITADEL_ISSUER_URL}
ENV VITE_DOCS_BASE_URL=${VITE_DOCS_BASE_URL}

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS prod-deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

RUN apk upgrade --no-cache \
    && rm -rf /usr/local/lib/node_modules/npm \
        /usr/local/bin/npm \
        /usr/local/bin/npx \
        /usr/local/bin/corepack

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./package.json

EXPOSE 8080
CMD ["node", "dist/server/server/index.js"]
