# Stage 1: Build VitePress site
FROM node:22-alpine AS build

WORKDIR /site

# Install dependencies
COPY services/sso-docs/package*.json ./
RUN npm ci

# Copy VitePress config and theme
COPY services/sso-docs/.vitepress/ ./.vitepress/
COPY services/sso-docs/public/ ./public/

# Copy source content directly to root (VitePress expects markdown at root)
# Single-source: content remains in docs/developers/ and docs/onboarding/
# Rewrite relative onboarding link to work in VitePress structure
COPY docs/developers/api-reference.md ./api-reference.md
COPY docs/developers/scopes-and-claims.md ./scopes-and-claims.md
COPY docs/developers/errors.md ./errors.md
COPY docs/developers/security-model.md ./security-model.md
COPY docs/developers/resource-server.md ./resource-server.md
COPY docs/onboarding/client-web-app-onboarding.md ./onboarding.md

# Copy README and rewrite the onboarding link for VitePress
COPY docs/developers/README.md ./index.md
RUN sed -i 's|\](../onboarding/client-web-app-onboarding.md)|](/onboarding)|g' ./index.md

# Build static site
RUN npm run docs:build

# Stage 2: Serve with nginx
FROM nginx:alpine

# Copy nginx config
COPY services/sso-docs/nginx.conf /etc/nginx/conf.d/default.conf

# Copy built site
COPY --from=build /site/.vitepress/dist /usr/share/nginx/html

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ || exit 1

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
