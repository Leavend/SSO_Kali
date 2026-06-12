# Laravel Integration

Laravel runs as a **confidential client**. Authorization codes, tokens, refresh tokens, and the client secret remain on the server.

> [!IMPORTANT]
> PKCE with `code_challenge_method=S256` is mandatory at this provider, including for confidential clients.

Refer to the [API Reference](../api-reference.md) for endpoint contracts.

## 1. Install Dependencies

```bash
composer require firebase/php-jwt
```

## 2. Environment Configuration

```dotenv
SSO_ISSUER=https://api-sso.timeh.my.id
SSO_CLIENT_ID=<registered-client-id>
SSO_CLIENT_SECRET=<secret-from-vault>
SSO_REDIRECT_URI=https://app.example.com/auth/sso/callback
SSO_POST_LOGOUT_URI=https://app.example.com/
```

Never expose `SSO_CLIENT_SECRET` to Blade or browser JavaScript.

```php
// config/services.php
'sso' => [
    'issuer' => env('SSO_ISSUER'),
    'client_id' => env('SSO_CLIENT_ID'),
    'client_secret' => env('SSO_CLIENT_SECRET'),
    'redirect_uri' => env('SSO_REDIRECT_URI'),
    'post_logout_uri' => env('SSO_POST_LOGOUT_URI'),
],
```

## 3. Authorize + PKCE

Store verifier, state, and nonce in the server session:

```php
public function redirect(): RedirectResponse
{
    $verifier = Str::random(64);
    $state = Str::random(40);
    $nonce = Str::random(40);
    session(['oidc.verifier' => $verifier, 'oidc.state' => $state, 'oidc.nonce' => $nonce]);

    $challenge = rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '=');
    $query = http_build_query([
        'client_id' => config('services.sso.client_id'),
        'redirect_uri' => config('services.sso.redirect_uri'),
        'response_type' => 'code',
        'scope' => 'openid profile email offline_access',
        'state' => $state,
        'nonce' => $nonce,
        'code_challenge' => $challenge,
        'code_challenge_method' => 'S256',
    ]);
    return redirect(config('services.sso.issuer').'/authorize?'.$query);
}
```

## 4. Callback and Exchange

Validate state, then exchange on the server:

```php
$tokens = Http::asForm()->post(config('services.sso.issuer').'/token', [
    'grant_type' => 'authorization_code',
    'client_id' => config('services.sso.client_id'),
    'client_secret' => config('services.sso.client_secret'),
    'code' => $request->string('code')->toString(),
    'redirect_uri' => config('services.sso.redirect_uri'),
    'code_verifier' => session()->pull('oidc.verifier'),
])->throw()->json();
```

Validate ID token signature, issuer, audience, expiry, and nonce before creating a local session. Encrypt refresh tokens at rest.

## 5. Refresh

```php
$tokens = Http::asForm()->post(config('services.sso.issuer').'/token', [
    'grant_type' => 'refresh_token',
    'client_id' => config('services.sso.client_id'),
    'client_secret' => config('services.sso.client_secret'),
    'refresh_token' => $encryptedRefreshToken,
])->throw()->json();
```

Atomically replace the previous refresh token with the rotated token.

## 6. Logout

Revoke the refresh token with confidential client authentication, delete the local session, and redirect to `/connect/logout` with a registered post-logout URI.

## 7. Troubleshooting

| Symptom | Check |
|---|---|
| `invalid_client` | Server secret, client ID, and active client status. |
| `invalid_grant` | Code TTL, exact redirect URI, and the original verifier. |
| State mismatch | Lost session/cookie or a stale callback. |
| Refresh replay | Serialize refresh and persist rotation atomically. |
