# Proxy Forwarded Header Snippets

## Goal

Preserve the public OIDC host and scheme across the `nginx -> traefik -> broker` chain so that:

- `redirect_uri` validation remains stable
- discovery documents publish public URLs
- runtime logs can identify host/proto drift before it becomes an outage

## Nginx snippet

Source artifact: [sso-forwarded-headers.conf](/Users/leavend/Desktop/Project_SSO/infra/nginx/snippets/sso-forwarded-headers.conf)

```nginx
proxy_set_header Host $host;
proxy_set_header X-Forwarded-Host $host;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-Port $server_port;
proxy_set_header Forwarded "for=$remote_addr;proto=$scheme;host=$host";
```

Use the snippet from the public TLS vhost:

```nginx
location / {
    include /etc/nginx/snippets/sso-forwarded-headers.conf;
    proxy_pass http://sso_traefik_web;
}
```

## Traefik trust boundary

Source artifact: [traefik.chained.yml](/Users/leavend/Desktop/Project_SSO/infra/traefik/traefik.chained.yml)

Traefik must trust forwarded headers only from loopback because host Nginx is the only public ingress:

```yaml
entryPoints:
  web:
    address: ":80"
    forwardedHeaders:
      insecure: false
      trustedIPs:
        - "127.0.0.1/32"
        - "::1/128"
```

## Runtime mismatch signal

The broker logs `[FORWARDED_HEADER_MISMATCH]` when:

- `X-Forwarded-Host` is missing or does not match `sso.base_url`
- `X-Forwarded-Proto` is missing or does not match `sso.base_url`

Structured log fields:

- `expected_host`
- `expected_proto`
- `forwarded_host`
- `forwarded_proto`
- `forwarded_port`
- `request_host`
- `request_scheme`
- `method`
- `path`
- `remote_addr`
- `reasons`

## References

- [NGINX `proxy_set_header`](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_set_header)
- [Traefik entryPoints forwarded headers](https://doc.traefik.io/traefik/reference/install-configuration/entrypoints/)
