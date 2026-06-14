# Laravel Integration

Laravel runs as a **confidential client**. Authorization codes, tokens, refresh tokens, and the client secret remain on the server.

> [!IMPORTANT]
> PKCE with `code_challenge_method=S256` is mandatory at this provider, including for confidential clients.

> [!TIP]
> Do not hardcode endpoint paths. Read `authorization_endpoint`, `token_endpoint`, `jwks_uri`, and `end_session_endpoint` from `/.well-known/openid-configuration`, cache the document, and treat discovery as the source of truth.

Start with the [Integration Checklist](../integration-checklist.md), then use the [API Reference](../api-reference.md) for endpoint contracts.

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

## 3. Discovery + Authorize + PKCE

Cache the discovery document, then use its endpoints. Store verifier, state, and nonce in the server session:

```php
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

function oidcDiscovery(): array
{
    $issuer = rtrim(config('services.sso.issuer'), '/');

    return Cache::remember('oidc.discovery', now()->addHour(), fn (): array =>
        Http::get($issuer.'/.well-known/openid-configuration')->throw()->json()
    );
}

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
        'scope' => 'openid profile email offline_access roles',
        'state' => $state,
        'nonce' => $nonce,
        'code_challenge' => $challenge,
        'code_challenge_method' => 'S256',
    ]);
    return redirect(oidcDiscovery()['authorization_endpoint'].'?'.$query);
}
```

`id_token` is for local login, so its `aud` must equal `client_id`. `access_token` is for resource-server calls and has a different audience.

## 4. Callback, Exchange, and `id_token` Validation

```php
use Firebase\JWT\JWK;
use Firebase\JWT\JWT;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

public function callback(Request $request): RedirectResponse
{
    abort_unless(
        is_string($request->state) && hash_equals((string) session()->pull('oidc.state'), $request->state),
        403,
    );

    $discovery = oidcDiscovery();
    $verifier = session()->pull('oidc.verifier');
    $nonce = session()->pull('oidc.nonce');

    $tokens = Http::asForm()->post($discovery['token_endpoint'], [
        'grant_type' => 'authorization_code',
        'client_id' => config('services.sso.client_id'),
        'client_secret' => config('services.sso.client_secret'),
        'code' => $request->string('code')->toString(),
        'redirect_uri' => config('services.sso.redirect_uri'),
        'code_verifier' => $verifier,
    ])->throw()->json();

    $jwks = Cache::remember('oidc.jwks', now()->addHour(), fn (): array =>
        Http::get($discovery['jwks_uri'])->throw()->json()
    );

    JWT::$leeway = 60;
    $keys = JWK::parseKeySet($jwks, 'ES256');
    $claims = (array) JWT::decode((string) $tokens['id_token'], $keys);

    abort_unless(($claims['iss'] ?? null) === rtrim(config('services.sso.issuer'), '/'), 403);

    $aud = $claims['aud'] ?? null;
    $clientId = config('services.sso.client_id');
    $audOk = is_array($aud) ? in_array($clientId, $aud, true) : $aud === $clientId;
    abort_unless($audOk, 403);

    abort_unless(($claims['nonce'] ?? null) === $nonce, 403);

    // JWT::decode() validates signature + exp/nbf.
    // `iss`, `aud`, and `nonce` still require explicit checks.
    return redirect('/dashboard');
}
```

`JWK::parseKeySet($jwks, 'ES256')` matters because a JWK set may omit `alg`, so you must pin the signing algorithm explicitly.

## 5. Refresh

```php
$tokens = Http::asForm()->post(oidcDiscovery()['token_endpoint'], [
    'grant_type' => 'refresh_token',
    'client_id' => config('services.sso.client_id'),
    'client_secret' => config('services.sso.client_secret'),
    'refresh_token' => $encryptedRefreshToken,
])->throw()->json();
```

Atomically replace the previous refresh token with the rotated token.

## 6. Role and Permission Mapping

If the application needs local RBAC, request the `roles` and/or `permissions` scopes, then read `roles[]` / `permissions[]` from the `id_token` or `userinfo` response.

```php
use Spatie\Permission\Models\Role;

$roles = collect($claims['roles'] ?? [])->filter()->values();
$permissions = collect($claims['permissions'] ?? [])->filter()->values();
$localRoles = $roles->filter(fn (string $role): bool => Role::where('name', $role)->exists());

if ($localRoles->isNotEmpty()) {
    $user->syncRoles($localRoles->all());
}
```

If SSO roles have not been provisioned in the local `roles` table, `syncRoles()` can throw `RoleDoesNotExist`. Filter as above, or provision roles first with a seeder / `Role::findOrCreate()`.

> [!WARNING]
> The claim name is `roles` (plural, array) — **not** `role`.

Optional scopes such as `roles`, `permissions`, and `offline_access` are emitted only when they are allow-listed for the client in the admin panel.

## 7. Logout

Revoke the refresh token with confidential client authentication, delete the local session, and redirect to the discovery-provided end-session endpoint with a registered post-logout URI.

## 8. Troubleshooting

| Symptom | Check |
|---|---|
| `invalid_client` | Server secret, client ID, and active client status. |
| `invalid_grant` | Code TTL, exact redirect URI, and the original verifier. |
| State mismatch | Lost session/cookie or a stale callback. |
| Refresh replay | Serialize refresh and persist rotation atomically. |
