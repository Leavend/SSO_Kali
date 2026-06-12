# Express Integration

Express runs as a **confidential client**. Tokens and the client secret stay on the server; the browser receives a session cookie.

> [!IMPORTANT]
> PKCE with `code_challenge_method=S256` is mandatory at this provider, including for confidential clients.

See the [API Reference](../api-reference.md) for endpoint contracts.

## 1. Install Dependencies

```bash
npm install express express-session jose
npm install --save-dev @types/express @types/express-session
```

## 2. Environment Configuration

```dotenv
SSO_ISSUER=https://api-sso.timeh.my.id
SSO_CLIENT_ID=<registered-client-id>
SSO_CLIENT_SECRET=<secret-from-vault>
SSO_REDIRECT_URI=https://app.example.com/auth/callback
SSO_POST_LOGOUT_URI=https://app.example.com/
SESSION_SECRET=<independent-session-signing-key>
```

Do not expose these values through a frontend bundler.

## 3. Authorize + PKCE

```ts
import { createHash, randomBytes } from 'node:crypto'

app.get('/auth/login', (req, res) => {
  const verifier = randomBytes(48).toString('base64url')
  const state = randomBytes(32).toString('base64url')
  const nonce = randomBytes(32).toString('base64url')
  req.session.oidc = { verifier, state, nonce }

  const authorize = new URL('/authorize', process.env.SSO_ISSUER)
  authorize.search = new URLSearchParams({
    client_id: process.env.SSO_CLIENT_ID!,
    redirect_uri: process.env.SSO_REDIRECT_URI!,
    response_type: 'code',
    scope: 'openid profile email offline_access',
    state,
    nonce,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
  }).toString()
  res.redirect(authorize.toString())
})
```

Use a shared session store such as Redis for multi-instance deployments.

## 4. Callback and Exchange

Validate state, remove temporary flow state, and exchange the code on the server:

```ts
const body = new URLSearchParams({
  grant_type: 'authorization_code',
  client_id: process.env.SSO_CLIENT_ID!,
  client_secret: process.env.SSO_CLIENT_SECRET!,
  code: String(req.query.code ?? ''),
  redirect_uri: process.env.SSO_REDIRECT_URI!,
  code_verifier: flow.verifier,
})
```

Validate ID token signature, issuer, audience, expiry, and nonce before storing an encrypted server session.

## 5. Refresh

Send the refresh token and confidential credentials from the server. Serialize refresh per session and persist the rotated token atomically.

## 6. Logout

Revoke the refresh token using confidential authentication, destroy the Express session, and redirect through `/connect/logout`.

## 7. Troubleshooting

| Symptom | Check |
|---|---|
| Callback loses state | Session store, proxy trust, secure cookie, and SameSite. |
| `invalid_client` | Runtime secret and confidential client type. |
| Refresh replay | Avoid parallel refresh and persist rotation atomically. |
| Login loop | Exact callback URI and cookie persistence. |
