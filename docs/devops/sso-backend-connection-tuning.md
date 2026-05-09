# SSO Backend Connection Pressure Tuning Runbook

This runbook documents Issue 38 tuning for public metadata/JWKS connection
pressure observed during WRK at `8 threads / 500 connections / 2m`.

The goal is to reduce connection errors, timeouts, and p99 latency without
changing application semantics.

## Trigger Evidence

Current WRK evidence exceeded the target but showed connection pressure:

```text
/jwks: 2008.82 RPS, p99 484.72ms, connect errors 253, timeouts 34
/.well-known/jwks.json: 2013.64 RPS, p99 606.18ms, connect errors 253, timeouts 37
/.well-known/openid-configuration: 1737.55 RPS, p99 678.02ms, connect errors 253, timeouts 36
```

Assessment:

```text
PASS with warning
```

## Tuning Script

Use:

```text
scripts/vps-apply-sso-connection-tuning.sh
```

The script supports:

```text
--mode audit
--mode apply
```

## Audit First

Run on the VPS:

```bash
sudo /opt/sso-backend-prod/scripts/vps-apply-sso-connection-tuning.sh --mode audit
```

Audit mode prints current Nginx/kernel values and planned changes. It does not
write files.

## Apply

Run only during a planned maintenance window:

```bash
sudo /opt/sso-backend-prod/scripts/vps-apply-sso-connection-tuning.sh --mode apply
```

Apply mode:

- Backs up Nginx and sysctl files with timestamp suffix.
- Writes TLS session cache config.
- Writes kernel backlog sysctl config.
- Patches Nginx worker and keepalive settings.
- Patches API site proxy settings.
- Runs `nginx -t`.
- Reloads Nginx only after config validation succeeds.

## Planned Settings

```text
worker_rlimit_nofile 65535
worker_connections 4096
multi_accept on
keepalive_timeout 30s
keepalive_requests 10000
ssl_session_cache shared:SSL:20m
ssl_session_timeout 1h
ssl_session_tickets off
proxy_http_version 1.1
proxy_set_header Connection ""
proxy_buffering on
proxy_buffer_size 16k
proxy_buffers 16 16k
net.core.somaxconn=4096
net.ipv4.tcp_max_syn_backlog=4096
```

## Verification

After apply:

```bash
nginx -t
systemctl status nginx --no-pager
curl -fsS https://api-sso.timeh.my.id/up
curl -fsS https://api-sso.timeh.my.id/ready
```

Run public smoke:

```bash
scripts/sso-backend-public-smoke.sh \
  --public-base-url https://api-sso.timeh.my.id \
  --frontend-base-url https://sso.timeh.my.id
```

Run WRK comparison:

```bash
scripts/sso-backend-metadata-wrk-smoke.sh \
  --public-base-url https://api-sso.timeh.my.id \
  --threads 8 \
  --connections 500 \
  --duration 2m
```

Compare:

- Requests/sec.
- p90 latency.
- p99 latency.
- Socket connect errors.
- Timeouts.

## Rollback

Each changed file gets a timestamped backup:

```text
/etc/nginx/nginx.conf.pre-sso-connection-tuning-<timestamp>
/etc/nginx/sites-available/api-sso.timeh.my.id.conf.pre-sso-connection-tuning-<timestamp>
/etc/nginx/conf.d/sso-connection-tuning.conf.pre-sso-connection-tuning-<timestamp>
/etc/sysctl.d/99-sso-backend-connection-tuning.conf.pre-sso-connection-tuning-<timestamp>
```

Rollback steps:

```bash
sudo cp /etc/nginx/nginx.conf.pre-sso-connection-tuning-<timestamp> /etc/nginx/nginx.conf
sudo cp /etc/nginx/sites-available/api-sso.timeh.my.id.conf.pre-sso-connection-tuning-<timestamp> /etc/nginx/sites-available/api-sso.timeh.my.id.conf
sudo rm -f /etc/nginx/conf.d/sso-connection-tuning.conf
sudo rm -f /etc/sysctl.d/99-sso-backend-connection-tuning.conf
sudo sysctl --system
sudo nginx -t
sudo systemctl reload nginx
```

## Safety Notes

- Do not change OAuth client secrets during this tuning.
- Do not disable TLS verification in operator smoke evidence.
- Do not raise application throttles blindly; metadata/JWKS routes should remain
  public-cache optimized and protected from abusive dynamic paths.
- If Nginx/socket tuning does not reduce p99 latency, review
  Octane/FrankenPHP workers and `SSO_BACKEND_OCTANE_WORKERS` before scaling
  horizontally.
