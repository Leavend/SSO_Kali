FROM node:24-alpine

ARG ZITADEL_VERSION=v4.14.0

RUN apk add --no-cache ca-certificates curl tar \
    && update-ca-certificates \
    && addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

WORKDIR /tmp

RUN asset="zitadel-login.tar.gz" \
    && checksum_asset=".artifacts/pack/${asset}" \
    && curl -fsSLO "https://github.com/zitadel/zitadel/releases/download/${ZITADEL_VERSION}/${asset}" \
    && curl -fsSLO "https://github.com/zitadel/zitadel/releases/download/${ZITADEL_VERSION}/checksums.txt" \
    && grep " ${checksum_asset}\$" checksums.txt | sed "s#  ${checksum_asset}\$#  ${asset}#" | sha256sum -c - \
    && mkdir -p /app \
    && tar -xzf "${asset}" -C /app \
    && chmod +x /app/entrypoint.sh \
    && rm -rf /tmp/*

RUN node -e 'const fs=require("fs"); const p="/app/apps/login/package.json"; const j=JSON.parse(fs.readFileSync(p,"utf8")); delete j.devDependencies; fs.writeFileSync(p,JSON.stringify(j,null,2));' \
    && npm install --prefix /app/apps/login --omit=dev --package-lock=false --no-audit --no-fund --ignore-scripts next@16.2.3 protobufjs@7.5.5 yaml@2.8.3 \
    && rm -rf /app/node_modules /root/.npm /tmp/* \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

COPY ./infra/zitadel-login/install-runtime-aliases.mjs /tmp/install-runtime-aliases.mjs
COPY ./infra/zitadel-login/patch-login-copy.mjs /tmp/patch-login-copy.mjs
COPY ./infra/zitadel-login/patch-login-language.mjs /tmp/patch-login-language.mjs
COPY ./infra/zitadel-login/patch-login-locale-alias.mjs /tmp/patch-login-locale-alias.mjs
COPY ./infra/zitadel-login/patch-login-theme.mjs /tmp/patch-login-theme.mjs
COPY ./infra/zitadel-login/patch-login-toggle.mjs /tmp/patch-login-toggle.mjs
COPY ./infra/zitadel-login/patch-login-floating-toggle.mjs /tmp/patch-login-floating-toggle.mjs
COPY ./infra/zitadel-login/patch-login-otp-behavior.mjs /tmp/patch-login-otp-behavior.mjs
COPY ./infra/zitadel-login/patch-login-signedin-redirect.mjs /tmp/patch-login-signedin-redirect.mjs
COPY ./infra/zitadel-login/patch-login-url-privacy.mjs /tmp/patch-login-url-privacy.mjs
COPY ./infra/zitadel-login/patch-login-responsive-errors.mjs /tmp/patch-login-responsive-errors.mjs
COPY ./infra/zitadel-login/patch-login-translation-fallback.mjs /tmp/patch-login-translation-fallback.mjs
COPY ./infra/zitadel-login/login-copy-catalog.mjs /tmp/login-copy-catalog.mjs
COPY ./infra/zitadel-login/login-copy-errors.mjs /tmp/login-copy-errors.mjs
COPY ./infra/zitadel-login/login-copy-residual.mjs /tmp/login-copy-residual.mjs
COPY ./packages/dev-sso-parent-ui/ /packages/dev-sso-parent-ui/
COPY ./infra/zitadel-login/assets/ /app/apps/login/public/

RUN node /tmp/patch-login-locale-alias.mjs /app/apps/login/.next \
    && node /tmp/install-runtime-aliases.mjs \
    && node /tmp/patch-login-copy.mjs /app/apps/login/.next \
    && node /tmp/patch-login-language.mjs /app/apps/login/.next \
    && node /tmp/patch-login-theme.mjs /app/apps/login/.next \
    && node /tmp/patch-login-toggle.mjs /app/apps/login/.next \
    && node /tmp/patch-login-floating-toggle.mjs /app/apps/login/.next \
    && node /tmp/patch-login-responsive-errors.mjs /app/apps/login/.next \
    && node /tmp/patch-login-otp-behavior.mjs /app/apps/login/.next \
    && node /tmp/patch-login-signedin-redirect.mjs /app/apps/login/.next \
    && node /tmp/patch-login-url-privacy.mjs /app/apps/login/.next \
    && node /tmp/patch-login-translation-fallback.mjs /app/apps/login/.next \
    && rm -f /tmp/install-runtime-aliases.mjs /tmp/patch-login-copy.mjs /tmp/patch-login-language.mjs /tmp/patch-login-locale-alias.mjs /tmp/patch-login-theme.mjs /tmp/patch-login-toggle.mjs /tmp/patch-login-floating-toggle.mjs /tmp/patch-login-responsive-errors.mjs /tmp/patch-login-otp-behavior.mjs /tmp/patch-login-signedin-redirect.mjs /tmp/patch-login-url-privacy.mjs /tmp/patch-login-translation-fallback.mjs /tmp/login-copy-catalog.mjs /tmp/login-copy-errors.mjs /tmp/login-copy-residual.mjs

RUN mkdir -p /.env-file \
    && touch /.env-file/.env \
    && chown -R nextjs:nodejs /app /.env-file

WORKDIR /app
USER nextjs

ENV HOSTNAME="::" \
    PORT="3000" \
    NODE_ENV="production" \
    NODE_OPTIONS="--use-openssl-ca" \
    SSL_CERT_FILE="/etc/ssl/certs/ca-certificates.crt" \
    SSL_CERT_DIR="/etc/ssl/certs" \
    ZITADEL_TLS_ENABLED="false" \
    OTEL_SDK_DISABLED="true" \
    OTEL_SERVICE_NAME="zitadel-login" \
    OTEL_EXPORTER_OTLP_PROTOCOL="http/protobuf"

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=5 \
    CMD wget -q -O - http://127.0.0.1:3000/ui/v2/login/healthy >/dev/null

ENTRYPOINT ["/app/entrypoint.sh", "node", "apps/login/server.js"]
