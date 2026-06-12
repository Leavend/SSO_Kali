# Errors and FAQ

OIDC/OAuth errors use safe descriptions. Branch on the `error` code and retain `error_ref` and `request_id` for support.

```json
{
  "error": "invalid_grant",
  "error_description": "The authorization grant is invalid.",
  "error_ref": "SSOERR-ABC1234",
  "request_id": "req-123",
  "retryable": false,
  "support_action": "login"
}
```

## Error Reference

| Error | HTTP | Resolution |
|---|---:|---|
| `invalid_request` | 400 | Check required parameters, exact redirect URI, state, nonce, and PKCE. |
| `unauthorized_client` | 400 | Check client status and grant/scope policy. |
| `access_denied` | 403 | Return safely to the application and allow a retry. |
| `unsupported_response_type` | 400 | Use `response_type=code`. |
| `invalid_scope` | 400 | Request allowed scopes and always include `openid`. |
| `invalid_client` | 401 | Check confidential credentials or omit a secret for public clients. |
| `invalid_grant` | 400 | Restart authorization and verify code, redirect URI, and verifier. |
| `invalid_token` | 401 | Refresh or sign in again; resource servers must verify audience. |
| `insufficient_scope` | 403 | Request and allow the required scope. |
| `login_required` | 401 | Start an interactive login. |
| `interaction_required`, `consent_required` | 400 | Start an interactive flow. |
| `too_many_attempts` | 429 | Honor `Retry-After` and back off. |
| `temporarily_unavailable` | 503 | Retry gradually and retain `error_ref`. |
| `server_error` | 500 | Show a safe message and report `error_ref`. |

## FAQ

### Why does a confidential client still need PKCE?

This provider requires PKCE S256 for all clients. The secret authenticates the client; PKCE binds the token exchange to the party that initiated authorization.

### Why does `/token` return `invalid_grant`?

Typical causes are an authorization code older than 120 seconds, code reuse, a different redirect URI, a mismatched verifier, or reuse of a rotated refresh token.

### Can the browser call the token endpoint?

A registered public SPA may exchange a code using PKCE without a secret. Confidential exchanges must run on the server. Never expose a client secret to browser code.

### What should happen on state mismatch?

Stop the exchange, delete temporary flow state, and restart login. A mismatch can indicate a lost session, stale tab, or CSRF attempt.
