FROM node:22-alpine AS build

RUN apk add --no-cache bash git

WORKDIR /site

COPY services/sso-docs/package*.json ./
RUN npm ci

COPY services/sso-docs/.vitepress/ ./.vitepress/
COPY services/sso-docs/public/ ./public/
COPY services/sso-docs/sync-content.sh ./sync-content.sh

# Keep source copying directory-based so new guides and locales are included
# automatically without changing this Dockerfile.
COPY docs/developers/ ./content-src/developers/
COPY docs/onboarding/ ./content-src/onboarding/
RUN CONTENT_SOURCE_ROOT=/site/content-src bash ./sync-content.sh \
  && rm -rf ./content-src

RUN npm run docs:build

FROM nginx:alpine

COPY services/sso-docs/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /site/.vitepress/dist /usr/share/nginx/html

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ || exit 1

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
