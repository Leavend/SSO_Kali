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

USER root
RUN apk upgrade --no-cache
USER 101

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist ./

EXPOSE 8080
