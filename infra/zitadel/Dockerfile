FROM alpine:3.20

ARG ZITADEL_VERSION=v4.11.0
ARG TARGETARCH=amd64

RUN apk add --no-cache ca-certificates curl tar \
    && update-ca-certificates

WORKDIR /tmp

RUN case "${TARGETARCH}" in \
      amd64) asset="zitadel-linux-amd64.tar.gz" ;; \
      arm64) asset="zitadel-linux-arm64.tar.gz" ;; \
      *) echo "Unsupported TARGETARCH: ${TARGETARCH}" >&2; exit 1 ;; \
    esac \
    && checksum_asset=".artifacts/pack/${asset}" \
    && curl -fsSLO "https://github.com/zitadel/zitadel/releases/download/${ZITADEL_VERSION}/${asset}" \
    && curl -fsSLO "https://github.com/zitadel/zitadel/releases/download/${ZITADEL_VERSION}/checksums.txt" \
    && grep " ${checksum_asset}\$" checksums.txt | sed "s#  ${checksum_asset}\$#  ${asset}#" | sha256sum -c - \
    && tar -xzf "${asset}" \
    && binary_path="$(find . -type f -name zitadel | head -n1)" \
    && [ -n "${binary_path}" ] \
    && mv "${binary_path}" /usr/local/bin/zitadel \
    && chmod +x /usr/local/bin/zitadel \
    && rm -rf /tmp/*

RUN addgroup -S zitadel \
    && adduser -S -G zitadel zitadel \
    && mkdir -p /app /zitadel/bootstrap \
    && chown -R zitadel:zitadel /app /zitadel

WORKDIR /app
USER zitadel

ENTRYPOINT ["/usr/local/bin/zitadel"]
