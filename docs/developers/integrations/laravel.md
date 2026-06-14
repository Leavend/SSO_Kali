# Integrasi Laravel

Panduan ini memakai Laravel sebagai **confidential client**. Authorization code, token, refresh token, dan client secret hanya diproses di server.

> [!IMPORTANT]
> PKCE dengan `code_challenge_method=S256` wajib di IdP ini, termasuk untuk confidential client.

> [!TIP]
> Jangan hardcode path endpoint. Ambil `authorization_endpoint`, `token_endpoint`, `jwks_uri`, dan `end_session_endpoint` dari discovery `/.well-known/openid-configuration`, cache hasilnya, lalu pakai nilai discovery sebagai source of truth.

Mulai dari [Integration Checklist](../integration-checklist.md), lalu rujuk [API Reference](../api-reference.md) untuk kontrak endpoint.

## 1. Install Dependencies

Gunakan HTTP client bawaan Laravel. Untuk validasi JWT lokal, tambahkan library JOSE yang mendukung ES256:

```bash
composer require firebase/php-jwt
```

## 2. Konfigurasi Environment

```dotenv
SSO_ISSUER=https://api-sso.timeh.my.id
SSO_CLIENT_ID=<registered-client-id>
SSO_CLIENT_SECRET=<secret-from-vault>
SSO_REDIRECT_URI=https://app.example.com/auth/sso/callback
SSO_POST_LOGOUT_URI=https://app.example.com/
```

Jangan memakai prefix frontend atau mengirim `SSO_CLIENT_SECRET` ke Blade/JavaScript.

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

Simpan dokumen discovery di cache, lalu pakai endpoint darinya. Simpan verifier, state, dan nonce di session server:

```php
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

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

    session([
        'oidc.verifier' => $verifier,
        'oidc.state' => $state,
        'oidc.nonce' => $nonce,
    ]);

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

`id_token` dipakai untuk login lokal → `aud` harus sama dengan `client_id`. `access_token` dipakai memanggil API resource server → `aud`-nya berbeda; jangan tertukar.

## 4. Callback, Exchange, dan Verifikasi `id_token`

```php
use Firebase\JWT\JWK;
use Firebase\JWT\JWT;
use Illuminate\Http\Request;
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

    // Signature + exp/nbf diverifikasi oleh JWT::decode().
    // `iss`, `aud`, dan `nonce` tetap wajib dicek manual.
    // Simpan refresh token terenkripsi di server; browser hanya menerima cookie session.
    return redirect('/dashboard');
}
```

`JWK::parseKeySet($jwks, 'ES256')` penting: JWK bisa tidak membawa `alg`, jadi algoritma signing harus ditegaskan eksplisit.

## 5. Refresh

```php
$tokens = Http::asForm()->post(oidcDiscovery()['token_endpoint'], [
    'grant_type' => 'refresh_token',
    'client_id' => config('services.sso.client_id'),
    'client_secret' => config('services.sso.client_secret'),
    'refresh_token' => $encryptedRefreshToken,
])->throw()->json();
```

Ganti refresh token lama secara atomik dengan token baru karena rotasi wajib.

## 6. Role & Permission Mapping

Jika app perlu RBAC lokal, minta scope `roles` dan/atau `permissions`, lalu baca claim `roles[]` / `permissions[]` dari `id_token` atau `userinfo`.

```php
use Spatie\Permission\Models\Role;

$roles = collect($claims['roles'] ?? [])->filter()->values();
$permissions = collect($claims['permissions'] ?? [])->filter()->values();
$localRoles = $roles->filter(fn (string $role): bool => Role::where('name', $role)->exists());

if ($localRoles->isNotEmpty()) {
    $user->syncRoles($localRoles->all());
}
```

Jika role SSO belum diprovisikan di tabel `roles`, `syncRoles()` bisa melempar `RoleDoesNotExist`. Filter seperti di atas, atau provisikan role lebih dulu dengan seeder / `Role::findOrCreate()`.

> [!WARNING]
> Nama claim adalah `roles` (jamak, array) — **bukan** `role`.

Scope opsional seperti `roles`, `permissions`, dan `offline_access` hanya terbit bila masuk allow-list client di admin panel.

## 7. Logout

Cabut refresh token dari server, hapus session lokal, lalu redirect browser ke RP-initiated logout:

```php
Http::asForm()->post(config('services.sso.issuer').'/revocation', [
    'client_id' => config('services.sso.client_id'),
    'client_secret' => config('services.sso.client_secret'),
    'token' => $refreshToken,
    'token_type_hint' => 'refresh_token',
]);

return redirect(oidcDiscovery()['end_session_endpoint'].'?'.http_build_query([
    'id_token_hint' => $idToken,
    'post_logout_redirect_uri' => config('services.sso.post_logout_uri'),
    'state' => Str::random(40),
]));
```

## 8. Troubleshooting

| Gejala | Periksa |
|---|---|
| `invalid_client` | Secret server, client ID, dan status client. |
| `invalid_grant` | TTL code, exact redirect URI, dan verifier PKCE yang sama. |
| State mismatch | Session/cookie hilang atau callback berasal dari flow lama. |
| Refresh replay | Pastikan hanya satu proses refresh dan update token atomik. |
