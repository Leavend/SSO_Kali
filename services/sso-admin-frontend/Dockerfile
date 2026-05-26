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

ENV VITE_ADMIN_BASE_URL=${VITE_ADMIN_BASE_URL}
ENV VITE_PUBLIC_BASE_PATH=${VITE_PUBLIC_BASE_PATH}
ENV VITE_SSO_BASE_URL=${VITE_SSO_BASE_URL}
ENV VITE_ZITADEL_ISSUER_URL=${VITE_ZITADEL_ISSUER_URL}

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.29-alpine AS runner
WORKDIR /usr/share/nginx/html

# Strip curl/libcurl from the static-asset runner: the image only serves the
# pre-built dist/ over nginx and never makes outbound HTTP calls, so the
# bundled curl is dead weight that keeps surfacing alpine high-severity CVEs
# (CVE-2025-14017, CVE-2026-3805, ...) before alpine ships fixes upstream.
USER root
RUN apk upgrade --no-cache \
    && apk del --no-cache curl libcurl 2>/dev/null || true
USER 101

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist ./

EXPOSE 8080
