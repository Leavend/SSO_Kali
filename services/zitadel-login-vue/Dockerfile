FROM node:22-alpine AS deps
WORKDIR /app
COPY services/zitadel-login-vue/package.json services/zitadel-login-vue/package-lock.json ./
RUN npm ci --ignore-scripts

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY services/zitadel-login-vue/ .
COPY packages/dev-sso-parent-ui/ /packages/dev-sso-parent-ui/
ARG VITE_PUBLIC_BASE_PATH=/ui/v2/login-vue
ENV VITE_PUBLIC_BASE_PATH=${VITE_PUBLIC_BASE_PATH}
RUN npm run build
RUN npm prune --omit=dev --ignore-scripts

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3010
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 login \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
COPY --from=builder --chown=login:nodejs /app/package.json ./package.json
COPY --from=builder --chown=login:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=login:nodejs /app/dist ./dist
USER login
EXPOSE 3010
CMD ["node", "dist/server/server/index.js"]
