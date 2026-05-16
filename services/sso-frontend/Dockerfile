FROM node:22-alpine AS deps
WORKDIR /app
COPY services/sso-frontend/package.json services/sso-frontend/package-lock.json ./
RUN npm ci --ignore-scripts

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY services/sso-frontend/ .
COPY packages/dev-sso-parent-ui/ /packages/dev-sso-parent-ui/
RUN rm -rf dist
ARG VITE_SSO_API_URL
ARG VITE_SSO_BASE_URL
ARG VITE_SSO_FRONTEND_BASE_URL
ARG VITE_CLIENT_ID
ARG VITE_OIDC_ISSUER
ARG VITE_OIDC_CLIENT_ID
ARG VITE_OIDC_REDIRECT_URI
ENV VITE_SSO_API_URL=${VITE_SSO_API_URL}
ENV VITE_SSO_BASE_URL=${VITE_SSO_BASE_URL}
ENV VITE_SSO_FRONTEND_BASE_URL=${VITE_SSO_FRONTEND_BASE_URL}
ENV VITE_CLIENT_ID=${VITE_CLIENT_ID}
ENV VITE_OIDC_ISSUER=${VITE_OIDC_ISSUER}
ENV VITE_OIDC_CLIENT_ID=${VITE_OIDC_CLIENT_ID}
ENV VITE_OIDC_REDIRECT_URI=${VITE_OIDC_REDIRECT_URI}
RUN npm run build
RUN npm prune --omit=dev --ignore-scripts

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 sso \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
COPY --from=builder --chown=sso:nodejs /app/package.json ./package.json
COPY --from=builder --chown=sso:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=sso:nodejs /app/dist ./dist
USER sso
EXPOSE 3000
CMD ["node", "dist/server/server/index.js"]
