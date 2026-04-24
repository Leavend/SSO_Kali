# Rollback Runbook: VPS Coexistence Strategy

## Goal

Revert the chained Nginx -> Traefik ingress with one operational step if staging or production validation fails.

## Trigger conditions

- Authorization redirect points to the wrong host or scheme.
- Callback URL validation fails.
- Public `dev-sso` host returns sustained `5xx`.
- Traefik loopback listener is unavailable.

## Preconditions

- Keep the previous Nginx site file backed up before enabling the chained config.
- Validate the backup path and checksum before the change window starts.

## One-step rollback

1. Restore the previous Nginx site configuration.
2. Run `nginx -t`.
3. Reload Nginx.

## Example commands

```bash
sudo cp /etc/nginx/sites-available/dev-sso.timeh.my.id.pre-change \
  /etc/nginx/sites-available/dev-sso.timeh.my.id

sudo nginx -t
sudo systemctl reload nginx
```

## Post-rollback verification

```bash
curl -kI https://dev-sso.timeh.my.id/
curl -kI "https://dev-sso.timeh.my.id/authorize?client_id=prototype-app-a&redirect_uri=https://app-a.timeh.my.id/auth/callback&response_type=code&scope=openid%20profile%20email&state=rollback-check&nonce=rollback-check&code_challenge=rollback-check&code_challenge_method=S256"
```

## Recovery note

Do not change Docker port bindings during emergency rollback.
The rollback boundary for this task is the host proxy rule, not the application stack.
